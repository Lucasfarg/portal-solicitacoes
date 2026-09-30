import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env.js';

// Cookie que carrega o token de sessão: fora do alcance de JavaScript (HttpOnly)
// e nunca enviado em requisições vindas de outro site (SameSite=Strict).
@Injectable()
export class SessionCookie {
  readonly name: string;
  private readonly options: CookieOptions;

  constructor(config: ConfigService<Env, true>) {
    const secure = config.get('HTTPS_ONLY', { infer: true });
    // Com o prefixo __Host- o navegador só aceita o cookie se ele vier com Secure,
    // Path=/ e sem Domain. Exige HTTPS, por isso fica fora do ambiente local.
    this.name = secure ? '__Host-sid' : 'sid';
    this.options = { httpOnly: true, sameSite: 'strict', secure, path: '/' };
  }

  read(request: Request): string | undefined {
    const value: unknown = request.cookies?.[this.name];
    return typeof value === 'string' && value !== '' ? value : undefined;
  }

  set(response: Response, token: string, maxAgeMs: number) {
    response.cookie(this.name, token, { ...this.options, maxAge: maxAgeMs });
  }

  clear(response: Response) {
    response.clearCookie(this.name, this.options);
  }
}
