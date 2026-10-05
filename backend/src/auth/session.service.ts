import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@portal/shared';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

const TOUCH_INTERVAL_MS = 60_000;

// No banco fica só o SHA-256: quem ler a tabela não usa as sessões.
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

  async create(userId: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + this.absoluteMs),
      },
    });
    return token;
  }

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
    if (expired || !session.user.active) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }

    let renewedAt = lastSeen;
    if (now - lastSeen >= TOUCH_INTERVAL_MS) {
      // updateMany: o update lançaria erro se a sessão fosse encerrada em outra aba nesse meio tempo.
      await this.prisma.session.updateMany({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      });
      renewedAt = now;
    }

    // last_seen_at avança de minuto em minuto, então o fim real pode ser até 1 min antes do calculado.
    const remainingMs = Math.min(renewedAt + this.idleMs, session.expiresAt.getTime()) - now;
    const { id, name, username, role } = session.user;
    return { user: { id, name, username, role }, remainingMs };
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
}
