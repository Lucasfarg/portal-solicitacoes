import { BreakpointObserver } from '@angular/cdk/layout';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import {
  PoButtonModule,
  PoButtonType,
  PoFieldModule,
  PoNotificationService,
  PoSelectOption,
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
import { Page } from '../layout/page';
import { DATE_TIME_FORMAT, isOverdue, STATUS_TAG_TYPE } from './request-view';

type Deadline = 'LATE' | 'ON_TIME' | 'CLOSED';

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
  deadline: Deadline;
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

// Valor da opção "Todas" nos filtros de situação e categoria. O po-select trata o valor
// vazio como "nada escolhido" e deixaria o campo em branco, na tela e para o leitor de tela.
const ALL = 'ALL';

@Component({
  selector: 'app-request-list',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    Page,
    PoFieldModule,
    PoButtonModule,
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
  protected readonly submitType = PoButtonType.Submit;
  protected readonly statusLabels = REQUEST_STATUS_LABELS;
  protected readonly statusTagType = STATUS_TAG_TYPE;
  protected readonly deadlineLabels: Record<Deadline, string> = {
    LATE: 'Atrasada',
    ON_TIME: 'No prazo',
    CLOSED: 'Encerrada',
  };
  protected readonly deadlineTagType: Record<Deadline, PoTagType> = {
    LATE: PoTagType.Danger,
    ON_TIME: PoTagType.Success,
    CLOSED: PoTagType.Neutral,
  };

  // Na tabela o solicitante só interessa ao atendente: o colaborador só vê as próprias.
  protected readonly isAgent = computed(() => this.auth.user()?.role === 'AGENT');
  protected readonly title = computed(() =>
    this.isAgent() ? 'Solicitações' : 'Minhas solicitações',
  );

  // ---------- Filtros ----------

  protected readonly filters = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    status: new FormControl<RequestStatus | typeof ALL>(ALL, { nonNullable: true }),
    categoryId: new FormControl<number | typeof ALL>(ALL, { nonNullable: true }),
    // <input type="date">: o valor já é AAAA-MM-DD, o formato que a API espera.
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
  });

  protected readonly statusOptions: PoSelectOption[] = [
    { label: 'Todas', value: ALL },
    ...REQUEST_STATUSES.map((status) => ({ label: REQUEST_STATUS_LABELS[status], value: status })),
  ];

  protected readonly categoryOptions = signal<PoSelectOption[]>([{ label: 'Todas', value: ALL }]);

  // ---------- Resultado ----------

  protected readonly loading = signal(true);
  protected readonly page = signal<RequestPage>(EMPTY_PAGE);
  protected readonly rows = computed(() => this.page().items.map(toRow));
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
      status: query.status ?? ALL,
      categoryId: query.categoryId ?? ALL,
      from: query.from ?? '',
      to: query.to ?? '',
    });
  }

  protected applyFilters(): void {
    const { q, status, categoryId, from, to } = this.filters.getRawValue();
    // Filtro sem valor vira null, que o roteador tira da URL. Sem `page`: filtrar volta à
    // página 1.
    this.navigate({
      q: q.trim() || null,
      status: status === ALL ? null : status,
      categoryId: categoryId === ALL ? null : categoryId,
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

  protected newRequest(): void {
    void this.router.navigate(['/solicitacoes/nova']);
  }

  protected open(row: Row): void {
    void this.router.navigate(['/solicitacoes', row.id]);
  }

  private navigate(queryParams: Params): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams });
  }
}
