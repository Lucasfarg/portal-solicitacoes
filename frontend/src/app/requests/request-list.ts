import { BreakpointObserver } from '@angular/cdk/layout';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router } from '@angular/router';
import {
  PoButtonModule,
  PoButtonType,
  PoDatepickerIsoFormat,
  PoFieldModule,
  PoNotificationService,
  PoPageAction,
  PoPageModule,
  PoSelectOption,
  PoTableAction,
  PoTableColumn,
  PoTableModule,
  PoTagModule,
  PoTagType,
  PoWidgetModule,
} from '@po-ui/ng-components';
import {
  ListRequestsQuery,
  listRequestsQuerySchema,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUSES,
  RequestDto,
  RequestPage,
  RequestStatus,
} from '@portal/shared';
import { EMPTY, catchError, map, switchMap, tap } from 'rxjs';
import { errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { PortalApi } from '../core/portal-api';
import { DATE_TIME_FORMAT, isOverdue, STATUS_TAG_TYPE } from './request-view';

// Uma linha da tabela (ou um cartão, no celular).
interface Row {
  id: number;
  code: string;
  title: string;
  category: string;
  requester: string;
  createdAt: string;
  dueAt: string;
  status: RequestStatus;
  deadline: 'LATE' | 'ON_TIME' | 'CLOSED';
}

function toRow(request: RequestDto): Row {
  return {
    id: request.id,
    code: request.code,
    title: request.title,
    category: request.category.name,
    requester: request.requester.name,
    createdAt: request.createdAt,
    dueAt: request.dueAt,
    status: request.status,
    deadline: request.status === 'DONE' ? 'CLOSED' : isOverdue(request) ? 'LATE' : 'ON_TIME',
  };
}

const EMPTY_PAGE: RequestPage = { items: [], page: 1, pageSize: 10, total: 0 };

@Component({
  selector: 'app-request-list',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    PoPageModule,
    PoFieldModule,
    PoButtonModule,
    PoTableModule,
    PoWidgetModule,
    PoTagModule,
  ],
  templateUrl: './request-list.html',
  styleUrl: './request-list.scss',
})
export class RequestList {
  private readonly api = inject(PortalApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notification = inject(PoNotificationService);

  protected readonly dateTimeFormat = DATE_TIME_FORMAT;
  protected readonly isoBasic = PoDatepickerIsoFormat.Basic;
  protected readonly submitType = PoButtonType.Submit;
  protected readonly statusLabels = REQUEST_STATUS_LABELS;
  protected readonly statusTagType = STATUS_TAG_TYPE;
  protected readonly danger = PoTagType.Danger;

  private readonly isAgent = computed(() => this.auth.user()?.role === 'AGENT');
  protected readonly title = computed(() =>
    this.isAgent() ? 'Solicitações' : 'Minhas solicitações',
  );

  protected readonly pageActions: PoPageAction[] = [
    {
      label: 'Nova solicitação',
      icon: 'an an-plus',
      action: () => void this.router.navigate(['/solicitacoes/nova']),
    },
  ];

  // ---------- Filtros ----------

  protected readonly filters = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    status: new FormControl<RequestStatus | ''>('', { nonNullable: true }),
    categoryId: new FormControl<number | ''>('', { nonNullable: true }),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });

  protected readonly statusOptions: PoSelectOption[] = [
    { label: 'Todas', value: '' },
    ...REQUEST_STATUSES.map((status) => ({ label: REQUEST_STATUS_LABELS[status], value: status })),
  ];

  protected readonly categoryOptions = signal<PoSelectOption[]>([{ label: 'Todas', value: '' }]);

  // ---------- Resultado ----------

  protected readonly loading = signal(true);
  protected readonly page = signal<RequestPage>(EMPTY_PAGE);
  protected readonly rows = computed(() => this.page().items.map(toRow));
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.page().total / this.page().pageSize)),
  );

  // Na tabela o solicitante só interessa ao atendente: o colaborador só vê as próprias.
  protected readonly columns = computed<PoTableColumn[]>(() => [
    { property: 'code', label: 'Código', width: '120px' },
    { property: 'title', label: 'Título' },
    { property: 'category', label: 'Categoria' },
    { property: 'requester', label: 'Solicitante', visible: this.isAgent() },
    { property: 'createdAt', label: 'Abertura', type: 'dateTime', format: DATE_TIME_FORMAT },
    { property: 'dueAt', label: 'Prazo', type: 'dateTime', format: DATE_TIME_FORMAT },
    {
      property: 'deadline',
      label: 'SLA',
      type: 'label',
      labels: [
        { value: 'LATE', label: 'Atrasada', type: PoTagType.Danger },
        { value: 'ON_TIME', label: 'No prazo', type: PoTagType.Success },
        { value: 'CLOSED', label: 'Encerrada', type: PoTagType.Neutral },
      ],
    },
    {
      property: 'status',
      label: 'Situação',
      type: 'label',
      labels: REQUEST_STATUSES.map((status) => ({
        value: status,
        label: REQUEST_STATUS_LABELS[status],
        type: STATUS_TAG_TYPE[status],
      })),
    },
  ]);

  protected readonly rowActions: PoTableAction[] = [
    { label: 'Abrir', action: (row: Row) => this.open(row) },
  ];

  // Em telas estreitas a tabela dá lugar a um cartão por solicitação.
  protected readonly isMobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 768px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  constructor() {
    this.api
      .categories()
      .subscribe((categories) =>
        this.categoryOptions.set([
          { label: 'Todas', value: '' },
          ...categories.map((category) => ({ label: category.name, value: category.id })),
        ]),
      );

    // A URL é a fonte da verdade dos filtros e da página: cada mudança na query string
    // refaz a busca (dá para recarregar, voltar e compartilhar o link). O switchMap
    // descarta a resposta de uma busca antiga se outra começou depois.
    this.route.queryParams
      .pipe(
        map((params) => this.readQuery(params)),
        tap((query) => {
          this.showInForm(query);
          this.loading.set(true);
        }),
        switchMap((query) =>
          this.api.listRequests(query).pipe(
            catchError((error: unknown) => {
              this.notification.error(errorMessage(error));
              this.loading.set(false);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        this.page.set(page);
        this.loading.set(false);
      });
  }

  // A query string é validada com o mesmo schema que a API usa para os filtros.
  private readQuery(params: Params): ListRequestsQuery {
    const parsed = listRequestsQuerySchema.safeParse(params);
    if (parsed.success) {
      return parsed.data;
    }
    this.notification.warning(parsed.error.issues[0].message);
    return listRequestsQuerySchema.parse({});
  }

  private showInForm(query: ListRequestsQuery): void {
    this.filters.setValue({
      q: query.q ?? '',
      status: query.status ?? '',
      categoryId: query.categoryId ?? '',
      from: query.from ?? '',
      to: query.to ?? '',
    });
  }

  protected applyFilters(): void {
    const { q, status, categoryId, from, to } = this.filters.getRawValue();
    // Valor vazio vira null, que o roteador tira da URL. Sem `page`: filtrar volta à página 1.
    this.navigate({
      q: q.trim() || null,
      status: status || null,
      categoryId: categoryId || null,
      from: from || null,
      to: to || null,
    });
  }

  protected clearFilters(): void {
    this.navigate({});
  }

  protected goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
  }

  protected open(row: Row): void {
    void this.router.navigate(['/solicitacoes', row.id]);
  }

  private navigate(queryParams: Params): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams });
  }
}
