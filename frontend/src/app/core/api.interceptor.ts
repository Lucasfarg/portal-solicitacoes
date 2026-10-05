import {
  HttpErrorResponse,
  HttpHeaders,
  HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  SESSION_IDLE_HEADER,
  SESSION_REMAINING_HEADER,
} from '@portal/shared';
import { EMPTY, catchError, tap, throwError } from 'rxjs';
import { SessionTimer } from './session-timer';

// No login o 401 é "senha errada" e em /auth/me é "ainda não entrou": a própria tela trata.
const AUTH_ROUTES = ['/api/auth/login', '/api/auth/me'];

// Acrescenta o cabeçalho de CSRF, reinicia o timer de sessão a cada resposta (inclusive de
// erro, pois a API renova a sessão do mesmo jeito) e trata o 401.
export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionTimer);

  const withCsrf = request.clone({ setHeaders: { [CSRF_HEADER]: CSRF_HEADER_VALUE } });

  return next(withCsrf).pipe(
    tap((event) => {
      if (event instanceof HttpResponse) {
        restartFrom(session, event.headers);
      }
    }),
    catchError((error: HttpErrorResponse) => {
      if (error.headers?.has(SESSION_IDLE_HEADER)) {
        restartFrom(session, error.headers);
      }
      if (error.status === 401 && !AUTH_ROUTES.includes(request.url)) {
        session.expire();
        // A tela não recebe o erro, para não mostrar um segundo aviso.
        return EMPTY;
      }
      return throwError(() => error);
    }),
  );
};

function restartFrom(session: SessionTimer, headers: HttpHeaders): void {
  const minutes = Number(headers.get(SESSION_IDLE_HEADER));
  const seconds = Number(headers.get(SESSION_REMAINING_HEADER));
  session.restart(minutes > 0 ? minutes : undefined, seconds > 0 ? seconds * 1000 : undefined);
}
