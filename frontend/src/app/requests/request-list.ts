import { BreakpointObserver } from '@angular/cdk/layout';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import {
  PoButtonModule,
  PoButtonType,
  PoDatepickerIsoFormat,
  PoFieldModule,
  PoNotificationService,
  PoPageAction,
  PoPageModule,
  PoSelectOption,
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
  RequestPage,
  RequestSummary,
  RequestStatus,
} from '@portal/shared';
import { EMPTY, Subject, catchError, map, merge, switchMap, tap } from 'rxjs';
import { errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { PortalApi } from '../core/portal-api';
import { LoadState } from '../layout/load-state';
import { CheckboxA11y, DatepickerA11y, PageA11y, TableA11y } from '../core/po-a11y';
import {
  assigneeName,
  DATE_TIME_FORMAT,
  listTitle,
  OVERDUE_LABEL,
  STATUS_TAG_TYPE,
} from './request-view';

interface Row {
  id: number;
  code: string;
  url: string;
  title: string;
  category: string;
  requester: string;
  assignee: string;
  createdAt: string;
  dueAt: string;
  due: { at: string; overdue: boolean };
  status: RequestStatus;
  overdue: boolean;
}

function toRow(request: RequestSummary): Row {
  return {
    id: request.id,
    code: request.code,
    url: `/solicitacoes/${request.id}`,
    title: request.title,
    category: request.category.name,
    requester: request.requester.name,
    assignee: assigneeName(request),
    createdAt: request.createdAt,
    dueAt: request.dueAt,
    // Calculado pela API, com o mesmo relógio do painel e do filtro.
    due: { at: request.dueAt, overdue: request.overdue },
    status: request.status,
    overdue: request.overdue,
  };
}

const EMPTY_PAGE: RequestPage = { items: [], page: 1, pageSize: 10, total: 0 };

// Valor da opção "Todas": o po-select trata o valor vazio como "nada escolhido" e deixaria o
// campo em branco.
const ALL = 'ALL';

@Component({
  selector: 'app-request-list',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    LoadState,
    PoFieldModule,
    PoButtonModule,
    PoPageModule,
    PoTableModule,
    PoWidgetModule,
    PoTagModule,
    PageA11y,
    TableA11y,
    CheckboxA11y,
    DatepickerA11y,
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
  protected readonly submitType = PoButtonType.Submit;
  protected readonly isoBasic = PoDatepickerIsoFormat.Basic;
  protected readonly tableLiterals = { noData: 'Nenhuma solicitação encontrada.' };
  protected readonly pageActions: PoPageAction[] = [
    {
      label: 'Nova solicitação',
      kind: 'primary',
      action: () => this.newRequest(),
    },
    { label: 'Exportar CSV', action: () => this.exportAs('csv') },
    { label: 'Exportar Word', action: () => this.exportAs('docx') },
  ];
  protected readonly statusLabels = REQUEST_STATUS_LABELS;
  protected readonly statusTagType = STATUS_TAG_TYPE;
  protected readonly overdueLabel = OVERDUE_LABEL;
  protected readonly danger = PoTagType.Danger;

  protected readonly isAgent = computed(() => this.auth.user()?.role === 'AGENT');
  protected readonly title = computed(() => listTitle(this.auth.user()));

  protected readonly filters = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    status: new FormControl<RequestStatus | typeof ALL>(ALL, { nonNullable: true }),
    categoryId: new FormControl<number | typeof ALL>(ALL, { nonNullable: true }),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
    overdue: new FormControl(false, { nonNullable: true }),
  });

  protected readonly statusOptions: PoSelectOption[] = [
    { label: 'Todas', value: ALL },
    ...REQUEST_STATUSES.map((status) => ({ label: REQUEST_STATUS_LABELS[status], value: status })),
  ];

  protected readonly categoryOptions = signal<PoSelectOption[]>([{ label: 'Todas', value: ALL }]);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private readonly reloads = new Subject<void>();
  protected readonly page = signal<RequestPage>(EMPTY_PAGE);
  protected readonly rows = computed(() => this.page().items.map(toRow));

  // Sem ordenar pelo cabeçalho: reordenar só a página atual enganaria quem lê.
  protected readonly columns = computed<PoTableColumn[]>(() => [
    { property: 'code', label: 'Código', type: 'link', link: 'url', sortable: false },
    { property: 'title', label: 'Título', width: '30%', sortable: false },
    { property: 'category', label: 'Categoria', sortable: false },
    ...(this.isAgent()
      ? [
          { property: 'requester', label: 'Solicitante', sortable: false },
          { property: 'assignee', label: 'Responsável', sortable: false },
        ]
      : []),
    {
      property: 'createdAt',
      label: 'Abertura',
      type: 'date',
      format: 'dd/MM/yyyy',
      sortable: false,
    },
    { property: 'due', label: 'Prazo', type: 'columnTemplate', sortable: false },
    {
      property: 'status',
      label: 'Situação',
      type: 'label',
      sortable: false,
      labels: REQUEST_STATUSES.map((status) => ({
        value: status,
        label: REQUEST_STATUS_LABELS[status],
        type: STATUS_TAG_TYPE[status],
      })),
    },
  ]);
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.page().total / this.page().pageSize)),
  );

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
          { label: 'Todas', value: ALL },
          ...categories.map((category) => ({ label: category.name, value: category.id })),
        ]),
      );

    // A URL é a fonte da verdade dos filtros e da página. `reloads` cobre os casos em que a
    // query string não muda; o switchMap descarta a resposta de uma busca antiga.
    merge(this.route.queryParams, this.reloads.pipe(map(() => this.route.snapshot.queryParams)))
      .pipe(
        map((params) => this.readQuery(params)),
        tap((query) => {
          this.showInForm(query);
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap((query) =>
          this.api.listRequests(query).pipe(
            catchError((error: unknown) => {
              this.error.set(errorMessage(error));
              this.page.set(EMPTY_PAGE);
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

  protected reload(): void {
    this.reloads.next();
  }

  // Valor inválido na query string (link editado à mão) é avisado e descartado; o resto vale.
  private readQuery(params: Params): ListRequestsQuery {
    const parsed = listRequestsQuerySchema.safeParse(params);
    if (parsed.success) {
      return parsed.data;
    }
    this.notification.warning(parsed.error.issues[0].message);
    const invalid = new Set(parsed.error.issues.map((issue) => String(issue.path[0])));
    const valid = Object.fromEntries(Object.entries(params).filter(([key]) => !invalid.has(key)));
    return listRequestsQuerySchema.safeParse(valid).data ?? listRequestsQuerySchema.parse({});
  }

  private showInForm(query: ListRequestsQuery): void {
    this.filters.setValue({
      q: query.q ?? '',
      status: query.status ?? ALL,
      categoryId: query.categoryId ?? ALL,
      from: query.from ?? '',
      to: query.to ?? '',
      overdue: query.overdue ?? false,
    });
  }

  protected applyFilters(): void {
    const { q, status, categoryId, from, to, overdue } = this.filters.getRawValue();
    // Confere antes de mudar a URL: o digitado continua nos campos para a pessoa corrigir.
    if (from && to && from > to) {
      this.notification.warning('A data "Aberta até" não pode ser anterior à "Aberta de".');
      document.querySelector<HTMLElement>('po-datepicker[name="to"] input')?.focus();
      return;
    }
    // Filtro sem valor vira null, que o roteador tira da URL. Sem `page`, volta à página 1.
    this.navigate({
      q: q.trim() || null,
      status: status === ALL ? null : status,
      categoryId: categoryId === ALL ? null : categoryId,
      from: from || null,
      to: to || null,
      overdue: overdue ? 'true' : null,
    });
  }

  // O po-datepicker cancela o Enter e, com o calendário aberto, ainda não passou a data
  // digitada ao formulário: ela é lida do campo.
  protected submitDate(control: 'from' | 'to', event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }
    const typed = event.target.value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (typed) {
      this.filters.controls[control].setValue(`${typed[3]}-${typed[2]}-${typed[1]}`);
    }
    this.applyFilters();
  }

  protected clearFilters(): void {
    this.navigate({});
  }

  protected clearSearch(): void {
    this.filters.controls.q.setValue('');
  }

  protected goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
  }

  // Baixa as solicitações com os filtros que estão na URL (todas as páginas).
  protected exportAs(format: 'csv' | 'docx'): void {
    const query = new URLSearchParams(this.route.snapshot.queryParams).toString();
    const link = document.createElement('a');
    link.href = `/api/requests/export/${format}${query ? `?${query}` : ''}`;
    link.download = '';
    link.click();
  }

  protected newRequest(): void {
    void this.router.navigate(['/solicitacoes/nova']);
  }

  // Refaz a busca mesmo com a URL igual, descartando o digitado e não aplicado.
  private navigate(queryParams: Params): void {
    const before = this.router.url;
    void this.router.navigate([], { relativeTo: this.route, queryParams }).then(() => {
      if (this.router.url === before) {
        this.reload();
      }
    });
  }
}
