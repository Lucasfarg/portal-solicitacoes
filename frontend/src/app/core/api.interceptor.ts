import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { PoNotificationService } from '@po-ui/ng-components';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@portal/shared';
import { EMPTY, catchError, tap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { SessionTimer } from './session-timer';

// No login o 401 é "senha errada" e em /auth/me é "ainda não entrou": a própria tela trata.
const AUTH_ROUTES = ['/api/auth/login', '/api/auth/me'];

// Passa por toda chamada à API:
// 1. acrescenta o cabeçalho que a defesa CSRF do servidor exige;
// 2. a cada resposta, recomeça a contagem do aviso de sessão perto de expirar;
// 3. se a sessão expirou (401), limpa o usuário, avisa uma vez e leva ao login, guardando
//    para onde voltar.
export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notification = inject(PoNotificationService);
  const session = inject(SessionTimer);

  const withCsrf = request.clone({ setHeaders: { [CSRF_HEADER]: CSRF_HEADER_VALUE } });

  return next(withCsrf).pipe(
    tap((event) => {
      if (event instanceof HttpResponse) {
        session.restart();
      }
    }),
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !AUTH_ROUTES.includes(request.url)) {
        // Uma tela pode ter várias chamadas em andamento: só a primeira avisa e redireciona.
        if (auth.user()) {
          auth.clear();
          session.stop();
          notification.warning('Sua sessão expirou. Entre de novo para continuar.');
          void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
        }
        // A tela que fez a chamada não recebe o erro: mostraria um segundo aviso à toa.
        return EMPTY;
      }
      return throwError(() => error);
    }),
  );
};
