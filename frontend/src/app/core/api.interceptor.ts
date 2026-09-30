import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { PoNotificationService } from '@po-ui/ng-components';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@portal/shared';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

// No login o 401 é "senha errada" e em /auth/me é "ainda não entrou": a própria tela trata.
const AUTH_ROUTES = ['/api/auth/login', '/api/auth/me'];

// Passa por toda chamada à API:
// 1. acrescenta o cabeçalho que a defesa CSRF do servidor exige;
// 2. se a sessão expirou (401), limpa o usuário e leva ao login, guardando para onde voltar.
export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notification = inject(PoNotificationService);

  const withCsrf = request.clone({ setHeaders: { [CSRF_HEADER]: CSRF_HEADER_VALUE } });

  return next(withCsrf).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !AUTH_ROUTES.includes(request.url)) {
        auth.clear();
        notification.warning('Sua sessão expirou. Entre de novo para continuar.');
        void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => error);
    }),
  );
};
