import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@portal/shared';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Evita uma escrita no banco a cada requisição: last_seen_at só avança de minuto em minuto.
const TOUCH_INTERVAL_MS = 60_000;

// No banco fica só o SHA-256 do token: quem ler a tabela não consegue usar as sessões.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SessionService {
  readonly idleMs: number;
  readonly absoluteMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.idleMs = config.get('SESSION_IDLE_MINUTES', { infer: true }) * 60_000;
    this.absoluteMs = config.get('SESSION_ABSOLUTE_HOURS', { infer: true }) * 3_600_000;
  }

  // Token opaco de 256 bits; só quem fez login o recebe, no cookie.
  async create(userId: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        // O instante sai da API, como o de todas as outras colunas de data.
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + this.absoluteMs),
      },
    });
    return token;
  }

  // Devolve o usuário da sessão e quanto falta para ela expirar por inatividade (ou pelo
  // limite absoluto, se vier antes), ou null se ela não existe ou expirou.
  async validate(token: string): Promise<{ user: AuthUser; remainingMs: number } | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session) {
      return null;
    }

    const now = Date.now();
    const lastSeen = session.lastSeenAt.getTime();
    const expired = session.expiresAt.getTime() <= now || lastSeen + this.idleMs <= now;
    // Usuário desativado perde na hora as sessões abertas.
    if (expired || !session.user.active) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }

    let renewedAt = lastSeen;
    if (now - lastSeen >= TOUCH_INTERVAL_MS) {
      // updateMany: se a sessão foi encerrada em outra aba entre a leitura e esta gravação,
      // nada é alterado (o update lançaria "registro não encontrado" no meio de outra rota).
      await this.prisma.session.updateMany({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      });
      renewedAt = now;
    }

    // Como last_seen_at só avança de minuto em minuto, o fim real pode estar até um minuto
    // antes de "agora + tempo de inatividade". A tela conta a partir deste número.
    const remainingMs = Math.min(renewedAt + this.idleMs, session.expiresAt.getTime()) - now;
    const { id, name, username, role } = session.user;
    return { user: { id, name, username, role }, remainingMs };
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
}
