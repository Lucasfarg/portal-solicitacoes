import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { PoNotificationService } from '@po-ui/ng-components';
import { AuthUser, RequestDetail } from '@portal/shared';
import { AuthService } from '../core/auth.service';
import { RequestForm } from './request-form';

const ana: AuthUser = { id: 1, name: 'Ana Souza', username: 'ana', role: 'REQUESTER' };

const CATEGORIES = [
  { id: 1, name: 'Compras', slaHours: 120 },
  { id: 5, name: 'TI', slaHours: 24 },
];

const saved: RequestDetail = {
  id: 7,
  code: 'SOL-000007',
  title: 'Notebook não liga',
  description: 'Parou ontem.',
  status: 'OPEN',
  category: { id: 5, name: 'TI' },
  requester: { id: ana.id, name: ana.name },
  assignee: null,
  dueAt: '2026-10-02T12:00:00.000Z',
  overdue: false,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
  history: [],
};

describe('RequestForm', () => {
  let fixture: ComponentFixture<RequestForm>;
  let component: RequestForm;
  let http: HttpTestingController;
  let router: Router;
  const notification = { success: vi.fn(), warning: vi.fn(), error: vi.fn() };

  // Monta o formulário na rota de nova solicitação (sem id) ou de edição (com id).
  function setup(routeParams: Record<string, string> = {}) {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      imports: [RequestForm],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PoNotificationService, useValue: notification },
        { provide: AuthService, useValue: { user: () => ana } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(routeParams) } },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(RequestForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne('/api/categories').flush(CATEGORIES);
  }

  const errorOf = (field: 'title' | 'categoryId' | 'description') =>
    component.form.controls[field].errors?.['zod'];

  afterEach(() => http.verify());

  describe('nova solicitação', () => {
    beforeEach(() => setup());

    it('vazio, não envia e mostra as mensagens do schema compartilhado', () => {
      component.save();
      fixture.detectChanges();

      expect(errorOf('title')).toBe('O título precisa de pelo menos 3 caracteres');
      expect(errorOf('categoryId')).toBe('Informe a categoria');
      expect(errorOf('description')).toBe('Informe a descrição');
      const shown = (fixture.nativeElement as HTMLElement).querySelectorAll('.field-error');
      expect(shown).toHaveLength(3);
      http.expectNone('/api/requests');
    });

    it('aplica os limites do schema: título curto e descrição só com espaços', () => {
      component.form.setValue({ title: 'ab', categoryId: 5, description: '   ' });

      expect(component.form.invalid).toBe(true);
      expect(errorOf('title')).toBe('O título precisa de pelo menos 3 caracteres');
      expect(errorOf('categoryId')).toBeUndefined();
      expect(errorOf('description')).toBe('Informe a descrição');
    });

    it('válido, envia à API sem os espaços das pontas e abre o detalhe', () => {
      component.form.setValue({
        title: '  Notebook não liga ',
        categoryId: 5,
        description: 'Parou ontem.',
      });

      component.save();

      const request = http.expectOne({ method: 'POST', url: '/api/requests' });
      expect(request.request.body).toEqual({
        title: 'Notebook não liga',
        categoryId: 5,
        description: 'Parou ontem.',
      });
      request.flush(saved);
      expect(router.navigate).toHaveBeenCalledWith(['/solicitacoes', 7]);
      expect(notification.success).toHaveBeenCalledWith('SOL-000007 aberta.');
    });

    it('erro de validação da API vira aviso com o motivo, e a tela continua no formulário', () => {
      component.form.setValue({ title: 'Notebook', categoryId: 5, description: 'Parou.' });

      component.save();
      http.expectOne('/api/requests').flush(
        {
          status: 400,
          detail: 'Dados inválidos',
          errors: [{ path: 'categoryId', message: 'Categoria inexistente ou inativa' }],
        },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(notification.error).toHaveBeenCalledWith(
        'Dados inválidos: Categoria inexistente ou inativa',
      );
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('saída com alterações não salvas', () => {
    beforeEach(() => setup());

    // A janela de confirmação, com a resposta da pessoa já escolhida.
    const answer = (confirm: boolean) =>
      vi
        .spyOn(component['dialog'](), 'ask')
        .mockImplementation((_question, onConfirm, onCancel) =>
          confirm ? onConfirm() : onCancel?.(),
        );

    it('sem alteração sai sem perguntar', () => {
      const ask = answer(true);

      expect(component.canLeave()).toBe(true);
      expect(ask).not.toHaveBeenCalled();
    });

    it('com alteração pergunta: "Continuar editando" fica, "Descartar" sai', async () => {
      component.form.controls.title.setValue('Rascunho');
      component.form.markAsDirty();

      answer(false);
      expect(await component.canLeave()).toBe(false);
      answer(true);
      expect(await component.canLeave()).toBe(true);
    });
  });

  describe('edição', () => {
    beforeEach(() => setup({ id: '7' }));

    it('carrega a solicitação no formulário e salva com PATCH', () => {
      http.expectOne('/api/requests/7').flush(saved);
      expect(component.form.getRawValue()).toEqual({
        title: 'Notebook não liga',
        categoryId: 5,
        description: 'Parou ontem.',
      });

      component.form.controls.title.setValue('Notebook não carrega');
      component.save();

      const request = http.expectOne({ method: 'PATCH', url: '/api/requests/7' });
      expect(request.request.body.title).toBe('Notebook não carrega');
      request.flush({ ...saved, title: 'Notebook não carrega' });
      expect(router.navigate).toHaveBeenCalledWith(['/solicitacoes', 7]);
    });

    it('fica travado até a solicitação chegar, para nada digitado ser sobrescrito', () => {
      expect(component.form.disabled).toBe(true);
      component.save();

      http.expectOne('/api/requests/7').flush(saved);
      expect(component.form.enabled).toBe(true);
    });

    it('volta ao detalhe se a solicitação já saiu de Aberto', () => {
      http.expectOne('/api/requests/7').flush({ ...saved, status: 'IN_PROGRESS' });

      expect(notification.warning).toHaveBeenCalledOnce();
      expect(router.navigate).toHaveBeenCalledWith(['/solicitacoes', 7]);
    });
  });
});
