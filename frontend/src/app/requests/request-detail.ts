import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  PoBreadcrumb,
  PoNotificationService,
  PoPageAction,
  PoPageModule,
  PoTableColumn,
  PoTableModule,
  PoTagModule,
  PoTagType,
} from '@po-ui/ng-components';
import { REQUEST_STATUS_LABELS, RequestDetail, RequestStatus } from '@portal/shared';
import { errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { ConfirmDialog } from '../core/confirm-dialog';
import { PageA11y, TableA11y } from '../core/po-a11y';
import { PortalApi } from '../core/portal-api';
import { LoadState } from '../layout/load-state';
import {
  ADVANCE_LABEL,
  assigneeName,
  canModify,
  DATE_TIME_FORMAT,
  listTitle,
  nextStatusFor,
  OVERDUE_LABEL,
  STATUS_TAG_TYPE,
  transitionLabel,
} from './request-view';

@Component({
  selector: 'app-request-detail',
  imports: [
    DatePipe,
    LoadState,
    ConfirmDialog,
    PoPageModule,
    PoTableModule,
    PoTagModule,
    PageA11y,
    TableA11y,
  ],
  templateUrl: './request-detail.html',
  styleUrl: './request-detail.scss',
})
export class RequestDetailPage {
  private readonly api = inject(PortalApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notification = inject(PoNotificationService);

  private readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  private readonly dialog = viewChild.required(ConfirmDialog);
  private readonly page = viewChild.required(PageA11y);

  protected readonly dateTimeFormat = DATE_TIME_FORMAT;
  protected readonly statusLabels = REQUEST_STATUS_LABELS;
  protected readonly statusTagType = STATUS_TAG_TYPE;
  protected readonly danger = PoTagType.Danger;
  protected readonly overdueLabel = OVERDUE_LABEL;

  protected readonly request = signal<RequestDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly breadcrumb = computed<PoBreadcrumb>(() => ({
    items: [
      { label: listTitle(this.auth.user()), link: '/solicitacoes' },
      { label: this.request()?.code ?? 'Solicitação' },
    ],
  }));

  protected readonly actions = computed<PoPageAction[]>(() => {
    const next = this.nextStatus();
    return [
      ...(next
        ? [{ label: ADVANCE_LABEL[next], kind: 'primary', action: () => this.confirmAdvance(next) }]
        : []),
      ...(this.canModify()
        ? [
            { label: 'Editar', kind: 'secondary', action: () => this.edit() },
            {
              label: 'Excluir',
              kind: 'secondary',
              type: 'danger',
              action: () => this.confirmRemove(),
            },
          ]
        : []),
    ];
  });

  protected readonly historyColumns: PoTableColumn[] = [
    { property: 'changedAt', label: 'Quando', type: 'dateTime', format: DATE_TIME_FORMAT },
    { property: 'change', label: 'O que mudou' },
    { property: 'changedBy', label: 'Quem' },
  ];

  protected readonly title = computed(() => {
    const request = this.request();
    return request ? `${request.code} — ${request.title}` : 'Solicitação';
  });

  protected readonly assignee = computed(() => {
    const request = this.request();
    return request ? assigneeName(request) : '';
  });

  protected readonly overdue = computed(() => {
    const request = this.request();
    return request?.overdue ?? false;
  });

  protected readonly nextStatus = computed(() => {
    const request = this.request();
    return request ? nextStatusFor(this.auth.user(), request) : null;
  });

  protected readonly canModify = computed(() => {
    const request = this.request();
    return request !== null && canModify(this.auth.user(), request);
  });

  protected readonly history = computed(() =>
    (this.request()?.history ?? []).map((entry) => ({
      changedAt: entry.changedAt,
      change: transitionLabel(entry.fromStatus, entry.toStatus),
      changedBy: entry.changedBy.name,
    })),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    if (!Number.isInteger(this.id) || this.id < 1) {
      this.leave('Solicitação não encontrada.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api.getRequest(this.id).subscribe({
      next: (request) => {
        this.request.set(request);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        // 404 vale também para a de outro colaborador (a API não revela que existe): volta
        // para a lista. Outra falha deixa a pessoa aqui para tentar de novo.
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        if (status === 404) {
          this.leave(errorMessage(error));
        } else {
          this.error.set(errorMessage(error));
        }
      },
    });
  }

  private leave(message: string): void {
    this.notification.error(message);
    void this.router.navigate(['/solicitacoes']);
  }

  protected edit(): void {
    void this.router.navigate(['/solicitacoes', this.id, 'editar']);
  }

  protected confirmAdvance(next: RequestStatus): void {
    this.dialog().ask(
      {
        title: ADVANCE_LABEL[next],
        message:
          next === 'IN_PROGRESS'
            ? `A solicitação passará para "${REQUEST_STATUS_LABELS[next]}" e você será o responsável por ela. Essa mudança não pode ser desfeita.`
            : `A solicitação passará para "${REQUEST_STATUS_LABELS[next]}". Essa mudança não pode ser desfeita.`,
        confirmLabel: ADVANCE_LABEL[next],
      },
      () => this.advance(next),
    );
  }

  private advance(next: RequestStatus): void {
    this.api.changeStatus(this.id, next).subscribe({
      next: (request) => {
        this.request.set(request);
        this.notification.success(`Status alterado para "${REQUEST_STATUS_LABELS[next]}".`);
        // O botão que tinha o foco muda de nome ou some.
        this.page().focusTitle();
      },
      error: (error: unknown) => this.showConflict(error),
    });
  }

  protected confirmRemove(): void {
    const request = this.request();
    if (!request) {
      return;
    }
    this.dialog().ask(
      {
        title: 'Excluir solicitação',
        message: `Excluir ${request.code} — ${request.title}? Essa ação não pode ser desfeita.`,
        confirmLabel: 'Excluir',
      },
      () => this.remove(request),
    );
  }

  private remove(request: RequestDetail): void {
    this.api.deleteRequest(request.id).subscribe({
      next: () => {
        this.notification.success(`${request.code} excluída.`);
        void this.router.navigate(['/solicitacoes']);
      },
      error: (error: unknown) => this.showConflict(error),
    });
  }

  // 409 (status mudou) ou 403: mostra o motivo e recarrega para os botões refletirem o estado.
  private showConflict(error: unknown): void {
    this.notification.error(errorMessage(error));
    this.load();
    this.page().focusTitle();
  }
}
