import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const WINDOW_MS = 60_000;
const MAX_PER_ACCOUNT = 5;
const MAX_PER_IP = 20;

// Só erros contam: num escritório com um IP só, logins certos não bloqueiam ninguém.
// A tentativa é gravada antes de contar, para uma rajada simultânea não passar pela contagem zerada.
@Injectable()
export class LoginThrottle {
  constructor(private readonly prisma: PrismaService) {}

  async begin(ip: string, username: string): Promise<number> {
    const now = Date.now();
    const since = new Date(now - WINDOW_MS);
    // Limpa o que passou da janela.
    await this.prisma.loginFailure.deleteMany({ where: { failedAt: { lte: since } } });

    const { id } = await this.prisma.loginFailure.create({
      data: { ip, username, failedAt: new Date(now) },
    });
    const [perAccount, perIp] = await Promise.all([
      this.prisma.loginFailure.count({ where: { ip, username, failedAt: { gt: since } } }),
      this.prisma.loginFailure.count({ where: { ip, failedAt: { gt: since } } }),
    ]);
    if (perAccount > MAX_PER_ACCOUNT || perIp > MAX_PER_IP) {
      // Recusada não conta como erro, senão quem insiste durante o bloqueio o estenderia sem fim.
      await this.prisma.loginFailure.deleteMany({ where: { id } });
      throw new HttpException(
        'Muitas tentativas de login. Aguarde um minuto e tente de novo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return id;
  }

  async succeed(ip: string, username: string): Promise<void> {
    await this.prisma.loginFailure.deleteMany({ where: { ip, username } });
  }
}
