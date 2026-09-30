import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthUser, LoginInput } from '@portal/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { verifyPassword } from './password.js';
import { SessionService } from './session.service.js';

// Hash Argon2id de uma senha aleatória descartada. Quando o usuário não existe, a senha
// é conferida contra ele: o tempo de resposta não revela quais logins estão cadastrados.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$fW9yjSHVdVW9DkfjiqkrmA$ZC7BzxOmFNDGMZpy5nFFPqI1oj7B2xOHoh1SdRW30g4';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async login({ username, password }: LoginInput): Promise<{ token: string; user: AuthUser }> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    const passwordMatches = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);
    if (!user || !passwordMatches) {
      // Mesma mensagem para usuário inexistente e senha errada.
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    // Token novo a cada login: nenhuma sessão anterior ao login é reaproveitada.
    const token = await this.sessions.create(user.id);
    return {
      token,
      user: { id: user.id, name: user.name, username: user.username, role: user.role },
    };
  }
}
