import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  GuardResult,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { AuthUser } from '@portal/shared';
import { Observable, firstValueFrom } from 'rxjs';
import { authGuard, guestGuard } from './auth.guard';

const ana: AuthUser = { id: 1, name: 'Ana Souza', username: 'ana', role: 'REQUESTER' };

describe('Guards de rota', () => {
  let http: HttpTestingController;
  let router: Router;

  // Executa o guard como o roteador faria, para a URL pedida.
  function run(guard: CanActivateFn, url: string): Promise<GuardResult> {
    const result = TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as Observable<GuardResult>;
    return firstValueFrom(result);
  }

  const answerSession = (user: AuthUser | null) => {
    const request = http.expectOne('/api/auth/me');
    if (user) {
      request.flush(user);
    } else {
      request.flush({ detail: 'Sessão inexistente ou expirada' }, { status: 401, statusText: '' });
    }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  describe('authGuard (telas internas)', () => {
    it('libera a rota quando a API confirma a sessão', async () => {
      const result = run(authGuard, '/solicitacoes');
      answerSession(ana);

      await expect(result).resolves.toBe(true);
    });

    it('sem sessão, manda para o login guardando a página pedida', async () => {
      const result = run(authGuard, '/solicitacoes/7');
      answerSession(null);

      const tree = (await result) as UrlTree;
      expect(router.serializeUrl(tree)).toBe('/login?returnUrl=%2Fsolicitacoes%2F7');
    });

    it('pergunta à API só na primeira navegação', async () => {
      const first = run(authGuard, '/painel');
      answerSession(ana);
      await first;

      await expect(run(authGuard, '/solicitacoes')).resolves.toBe(true);
      http.expectNone('/api/auth/me');
    });
  });

  describe('guestGuard (tela de login)', () => {
    it('sem sessão, mostra o login', async () => {
      const result = run(guestGuard, '/login');
      answerSession(null);

      await expect(result).resolves.toBe(true);
    });

    it('com sessão, manda para o início', async () => {
      const result = run(guestGuard, '/login');
      answerSession(ana);

      expect(router.serializeUrl((await result) as UrlTree)).toBe('/');
    });
  });
});
