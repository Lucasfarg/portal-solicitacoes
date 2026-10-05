import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { SESSION_IDLE_HEADER, SESSION_REMAINING_HEADER } from '@portal/shared';
import type { Response } from 'express';
import type { Env } from '../config/env.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { SessionService } from './session.service.js';
import { SessionCookie } from './session-cookie.js';

// Guard global: toda rota exige sessão válida, exceto as marcadas com @Public().
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly idleMinutes: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly cookie: SessionCookie,
    private readonly sessions: SessionService,
    config: ConfigService<Env, true>,
  ) {
    this.idleMinutes = String(config.get('SESSION_IDLE_MINUTES', { infer: true }));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.cookie.read(request);
    const session = token ? await this.sessions.validate(token) : null;
    if (!token || !session) {
      throw new UnauthorizedException('Sessão inexistente ou expirada');
    }

    request.user = session.user;
    request.sessionToken = token;
    // A tela calcula o aviso de sessão perto de expirar com os valores que a API usa de fato.
    // Os cabeçalhos ficam também nas respostas de erro (409, 404…) desta requisição.
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader(SESSION_IDLE_HEADER, this.idleMinutes);
    response.setHeader(SESSION_REMAINING_HEADER, String(Math.floor(session.remainingMs / 1000)));
    return true;
  }
}
