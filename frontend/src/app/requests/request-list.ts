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
import { EMPTY, Subject, catchError, filter, map, merge, switchMap, tap } from 'rxjs';
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

// Uma linha da tabela (ou um cartão, no celular).
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
  // O que a coluna "Prazo" desenha: a data e a etiqueta "Fora do prazo".
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
    // Calculado pela API, com o relógio dela (o mesmo do painel e do filtro).
    due: { at: request.dueAt, overdue: request.overdue },
    status: request.status,
    overdue: request.overdue,
  };
}

const EMPTY_PAGE: Omit<RequestPage, 'asOf'> = { items: [], page: 1, pageSize: 10, total: 0 };

// Valor da opção "Todas" nos filtros de situação e categoria. O po-select trata o valor
// vazio como "nada escolhido" e deixaria o campo em branco, na tela e para o leitor de tela.
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
  // A data do filtro vai para a API como AAAA-MM-DD, o formato que ela espera.
  protected readonly isoBasic = PoDatepickerIsoFormat.Basic;
  protected readonly tableLiterals = { noData: 'Nenhuma solicitação encontrada.' };
  protected readonly pageActions: PoPageAction[] = [
    {
      label: 'Nova solicitação',
      icon: 'an an-plus',
      kind: 'primary',
      action: () => this.newRequest(),
    },
  ];
  protected readonly statusLabels = REQUEST_STATUS_LABELS;
  protected readonly statusTagType = STATUS_TAG_TYPE;
  // Só quem está fora do prazo ganha etiqueta: "no prazo" é o normal e não precisa de cor.
  protected readonly overdueLabel = OVERDUE_LABEL;
  protected readonly danger = PoTagType.Danger;

  // Solicitante e responsável só interessam ao atendente: o colaborador só vê as próprias.
  protected readonly isAgent = computed(() => this.auth.user()?.role === 'AGENT');
  protected readonly title = computed(() => listTitle(this.auth.user()));

  // ---------- Filtros ----------

  protected readonly filters = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    status: new FormControl<RequestStatus | typeof ALL>(ALL, { nonNullable: true }),
    categoryId: new FormControl<number | typeof ALL>(ALL, { nonNullable: true }),
    // po-datepicker com p-iso-format "basic": o valor é AAAA-MM-DD.
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
    overdue: new FormControl(false, { nonNullable: true }),
  });

  protected readonly statusOptions: PoSelectOption[] = [
    { label: 'Todas', value: ALL },
    ...REQUEST_STATUSES.map((status) => ({ label: REQUEST_STATUS_LABELS[status], value: status })),
  ];

  protected readonly categoryOptions = signal<PoSelectOption[]>([{ label: 'Todas', value: ALL }]);

  // ---------- Resultado ----------

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private readonly reloads = new Subject<void>();
  protected readonly page = signal<Omit<RequestPage, 'asOf'>>(EMPTY_PAGE);
  // asOf que a própria tela acabou de gravar na URL com o instante devolvido pela API: a
  // mudança de URL que ele causa não precisa de outra busca.
  private stampedAsOf: string | null = null;
  protected readonly rows = computed(() => this.page().items.map(toRow));

  // Sem ordenar pelo cabeçalho: a lista vem da API, das mais recentes para as mais antigas, e
  // reordenar só a página atual enganaria quem a lê.
  protected readonly columns = computed<PoTableColumn[]>(() => [
    { property: 'code', label: 'Código', type: 'link', link: 'url', sortable: false },
    { property: 'title', label: 'Título', sortable: false },
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
      type: 'dateTime',
      format: DATE_TIME_FORMAT,
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
          { label: 'Todas', value: ALL },
          ...categories.map((category) => ({ label: category.name, value: category.id })),
        ]),
      );

    // A URL é a fonte da verdade dos filtros e da página: cada mudança na query string
    // refaz a busca (dá para recarregar, voltar e compartilhar o link). O "Tentar de novo"
    // repete a mesma URL, que não muda a query string; esse caso passa pelo `reloads`. O
    // switchMap descarta a resposta de uma busca antiga se outra começou depois.
    merge(
      this.route.queryParams.pipe(filter((params) => !this.isOwnStamp(params))),
      this.reloads.pipe(map(() => this.route.snapshot.queryParams)),
    )
      .pipe(
        map((params) => this.readQuery(params)),
        tap((query) => {
          this.showInForm(query);
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap((query) =>
          this.api.listRequests(query).pipe(
            tap((page) => this.stampAsOf(query, page)),
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

  // O asOf ("até agora") fixa o conjunto da busca: só entram as solicitações abertas até
  // aquele instante, e a página 2 não muda enquanto a pessoa pagina, mesmo com solicitações
  // novas chegando. A primeira busca vai sem ele (menu, painel, "Filtrar"); a API usa o relógio
  // dela e devolve o instante, que fica na URL para as próximas páginas. O relógio do
  // navegador não entra: um PC com a hora atrasada esconderia o que acabou de ser aberto.
  private stampAsOf(query: ListRequestsQuery, page: RequestPage): void {
    if (query.asOf) {
      return;
    }
    this.stampedAsOf = page.asOf;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { asOf: page.asOf },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private isOwnStamp(params: Params): boolean {
    if (this.stampedAsOf === null || params['asOf'] !== this.stampedAsOf) {
      return false;
    }
    this.stampedAsOf = null;
    return true;
  }

  // A query string é validada com o mesmo schema que a API usa para os filtros. Um valor
  // inválido (link editado à mão, data final antes da inicial) é avisado e descartado; o resto
  // continua valendo, e a paginação não trava.
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
    // A mesma regra do schema, conferida antes de mudar a URL: a busca não sai, e o que foi
    // digitado continua nos campos para a pessoa corrigir.
    if (from && to && from > to) {
      this.notification.warning('A data "Aberta até" não pode ser anterior à "Aberta de".');
      document.querySelector<HTMLElement>('po-datepicker[name="to"] input')?.focus();
      return;
    }
    // Filtro sem valor vira null, que o roteador tira da URL. Sem `page`: filtrar volta à
    // página 1. Sem `asOf`: a busca nova traz também o que foi aberto desde a última.
    this.navigate({
      q: q.trim() || null,
      status: status === ALL ? null : status,
      categoryId: categoryId === ALL ? null : categoryId,
      from: from || null,
      to: to || null,
      overdue: overdue ? 'true' : null,
    });
  }

  // Enter num campo de data envia o filtro, como nos outros campos. O po-datepicker cancela a
  // tecla e, com o calendário aberto (é o que o Tab faz ao chegar no campo), ainda não passou
  // ao formulário a data digitada: ela é lida do campo aqui.
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

  // Esc no campo "Título" apaga o que foi digitado, sem buscar: a busca continua sendo
  // pelo "Filtrar" (ou Enter).
  protected clearSearch(): void {
    this.filters.controls.q.setValue('');
  }

  // Trocar de página mantém os filtros e o asOf da URL.
  protected goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
  }

  protected newRequest(): void {
    void this.router.navigate(['/solicitacoes/nova']);
  }

  // "Filtrar" e "Limpar filtros" tiram o asOf da URL, que muda (e a busca é refeita) mesmo com
  // os mesmos filtros; o que foi digitado e não aplicado é trocado pelo que está na URL.
  private navigate(queryParams: Params): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams });
  }
}
