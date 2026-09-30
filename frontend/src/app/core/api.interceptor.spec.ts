import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PoNotificationService } from '@po-ui/ng-components';
import { apiInterceptor } from './api.interceptor';
import { AuthService } from './auth.service';
import { SessionTimer } from './session-timer';

describe('apiInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let router: Router;
  const notification = { warning: vi.fn() };

  const unauthorized = { status: 401, statusText: 'Unauthorized' };

  beforeEach(() => {
    notification.warning.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        { provide: PoNotificationService, useValue: notification },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => backend.verify());

  it('acrescenta o cabeçalho da defesa CSRF em toda chamada', () => {
    http.post('/api/requests', {}).subscribe();

    const request = backend.expectOne('/api/requests');
    expect(request.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    request.flush({});
  });

  it('a cada resposta da API recomeça a contagem do aviso de sessão perto de expirar', () => {
    const restart = vi.spyOn(TestBed.inject(SessionTimer), 'restart');

    http.get('/api/categories').subscribe();
    expect(restart).not.toHaveBeenCalled();
    backend.expectOne('/api/categories').flush([]);

    expect(restart).toHaveBeenCalledOnce();
    TestBed.inject(SessionTimer).stop();
  });

  it('quando a sessão expira (401), limpa o usuário, avisa uma vez e leva ao login', () => {
    const auth = TestBed.inject(AuthService);
    auth.login({ username: 'ana', password: 'Senha@123' }).subscribe();
    backend
      .expectOne('/api/auth/login')
      .flush({ id: 1, name: 'Ana Souza', username: 'ana', role: 'REQUESTER' });
    expect(auth.user()).not.toBeNull();

    // Duas chamadas da mesma tela em andamento quando a sessão acaba.
    const screenError = vi.fn();
    http.get('/api/requests').subscribe({ error: screenError });
    http.get('/api/categories').subscribe({ error: screenError });
    backend.expectOne('/api/requests').flush({ detail: 'Sessão expirada' }, unauthorized);
    backend.expectOne('/api/categories').flush({ detail: 'Sessão expirada' }, unauthorized);

    expect(auth.user()).toBeNull();
    expect(notification.warning).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/' } });
    // A tela não recebe o erro: não há um segundo aviso.
    expect(screenError).not.toHaveBeenCalled();
  });

  it('não redireciona no 401 do próprio login (senha errada)', () => {
    http.post('/api/auth/login', {}).subscribe({ error: () => undefined });
    backend
      .expectOne('/api/auth/login')
      .flush({ detail: 'Usuário ou senha inválidos' }, unauthorized);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(notification.warning).not.toHaveBeenCalled();
  });
});
