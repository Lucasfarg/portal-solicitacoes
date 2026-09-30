import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PoNotificationService } from '@po-ui/ng-components';
import { apiInterceptor } from './api.interceptor';
import { AuthService } from './auth.service';

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

  it('quando a sessão expira (401), limpa o usuário e leva ao login', () => {
    const auth = TestBed.inject(AuthService);
    auth.login({ username: 'ana', password: 'Senha@123' }).subscribe();
    backend
      .expectOne('/api/auth/login')
      .flush({ id: 1, name: 'Ana Souza', username: 'ana', role: 'REQUESTER' });
    expect(auth.user()).not.toBeNull();

    http.get('/api/requests').subscribe({ error: () => undefined });
    backend.expectOne('/api/requests').flush({ detail: 'Sessão expirada' }, unauthorized);

    expect(auth.user()).toBeNull();
    expect(notification.warning).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/' } });
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
