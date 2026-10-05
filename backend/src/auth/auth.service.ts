import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { AuthUser, LoginInput } from '@portal/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginThrottle } from './login-throttle.js';
import { verifyPassword } from './password.js';
import { SessionService } from './session.service.js';

// Conferido quando o usuário não existe, para o tempo de resposta não revelar quais logins existem.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$fW9yjSHVdVW9DkfjiqkrmA$ZC7BzxOmFNDGMZpy5nFFPqI1oj7B2xOHoh1SdRW30g4';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottle,
  ) {}

  async login(
    { username, password }: LoginInput,
    ip: string,
  ): Promise<{ token: string; user: AuthUser }> {
    // Grava a tentativa antes de conferir a senha (ver LoginThrottle).
    await this.throttle.begin(ip, username);

    const user = await this.prisma.user.findUnique({ where: { username } });
    const passwordMatches = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);
    // Desativado recebe a mesma resposta: a tela não revela quem existe.
    if (!user?.active || !passwordMatches) {
      this.logger.warn(`Login recusado para "${username}" a partir de ${ip}`);
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }
    await this.throttle.succeed(ip, username);

    const token = await this.sessions.create(user.id);
    return {
      token,
      user: { id: user.id, name: user.name, username: user.username, role: user.role },
    };
  }
}
