import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { LoginThrottle } from './login-throttle.js';
import { SessionService } from './session.service.js';
import { SessionCookie } from './session-cookie.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    SessionCookie,
    LoginThrottle,
    // Guards globais, nesta ordem: primeiro CSRF, depois sessão.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionService, SessionCookie],
})
export class AuthModule {}
