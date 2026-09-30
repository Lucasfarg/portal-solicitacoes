import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { SessionService } from './session.service.js';
import { SessionCookie } from './session-cookie.js';

@Module({
  imports: [
    // Usado só no login (ThrottlerGuard na rota): 5 tentativas por minuto por IP.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 5 }],
      errorMessage: 'Muitas tentativas de login. Aguarde um minuto e tente de novo.',
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    SessionCookie,
    // Guards globais, nesta ordem: primeiro CSRF, depois sessão.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionService, SessionCookie],
})
export class AuthModule {}
