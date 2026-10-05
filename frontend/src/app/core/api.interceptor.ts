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

// Passa por toda chamada à API:
// 1. acrescenta o cabeçalho que a defesa CSRF do servidor exige;
// 2. a cada resposta, recomeça a contagem do aviso de sessão perto de expirar, com os
//    minutos de sessão e o que falta deles, informados pela API nos cabeçalhos
//    SESSION_IDLE_HEADER e SESSION_REMAINING_HEADER. Vale também para respostas de erro
//    (409, 404…): a API renovou a sessão do mesmo jeito;
// 3. se a sessão expirou (401), limpa o usuário, avisa uma vez e leva ao login, guardando
//    para onde voltar.
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
        // Uma tela pode ter várias chamadas em andamento: só a primeira avisa e redireciona.
        session.expire();
        // A tela que fez a chamada não recebe o erro: mostraria um segundo aviso à toa.
        return EMPTY;
      }
      return throwError(() => error);
    }),
  );
};

// Sem os cabeçalhos (ou com um valor que não é número), o timer usa o padrão.
function restartFrom(session: SessionTimer, headers: HttpHeaders): void {
  const minutes = Number(headers.get(SESSION_IDLE_HEADER));
  const seconds = Number(headers.get(SESSION_REMAINING_HEADER));
  session.restart(minutes > 0 ? minutes : undefined, seconds > 0 ? seconds * 1000 : undefined);
}
