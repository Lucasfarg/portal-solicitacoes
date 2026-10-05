import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const WINDOW_MS = 60_000;
// Erros seguidos no mesmo usuário, vindos do mesmo IP: o caso de quem tenta adivinhar a senha.
const MAX_PER_ACCOUNT = 5;
// Erros do mesmo IP somando todos os usuários: quem testa uma senha em muitos logins.
const MAX_PER_IP = 20;

// Limite de tentativas de login. Só contam as que erram: num escritório em que todos saem pelo
// mesmo IP, logins certos não bloqueiam ninguém. Um login certo zera os erros daquele usuário.
// Os erros ficam no banco (login_failures): a contagem vale para todas as instâncias da API e
// sobrevive a um reinício.
//
// Cada tentativa grava a sua linha antes de contar, e só então a senha é conferida. Contar
// primeiro e gravar depois deixaria uma rajada de tentativas simultâneas passar toda pela
// contagem zerada; assim, a sexta tentativa vê as cinco anteriores mesmo que cheguem juntas.
// A linha vira o registro do erro se a senha estiver errada e sai se estiver certa.
@Injectable()
export class LoginThrottle {
  constructor(private readonly prisma: PrismaService) {}

  // Reserva a tentativa e devolve o id da linha; recusa (429) se passou de algum limite.
  async begin(ip: string, username: string): Promise<number> {
    const now = Date.now();
    const since = new Date(now - WINDOW_MS);
    // Limpeza a cada tentativa: o que passou da janela não conta mais, e a tabela fica pequena.
    await this.prisma.loginFailure.deleteMany({ where: { failedAt: { lte: since } } });

    const { id } = await this.prisma.loginFailure.create({
      data: { ip, username, failedAt: new Date(now) },
    });
    // As contagens incluem a linha desta tentativa.
    const [perAccount, perIp] = await Promise.all([
      this.prisma.loginFailure.count({ where: { ip, username, failedAt: { gt: since } } }),
      this.prisma.loginFailure.count({ where: { ip, failedAt: { gt: since } } }),
    ]);
    if (perAccount > MAX_PER_ACCOUNT || perIp > MAX_PER_IP) {
      // A tentativa recusada não chegou a conferir a senha: não conta como erro, senão quem
      // insiste durante o bloqueio o estenderia sem fim.
      await this.prisma.loginFailure.deleteMany({ where: { id } });
      throw new HttpException(
        'Muitas tentativas de login. Aguarde um minuto e tente de novo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return id;
  }

  // Senha certa: apaga a reserva e os erros anteriores daquele usuário naquele IP. A senha
  // errada não precisa de nada: a linha reservada em begin() já é o registro do erro.
  async succeed(ip: string, username: string): Promise<void> {
    await this.prisma.loginFailure.deleteMany({ where: { ip, username } });
  }
}
