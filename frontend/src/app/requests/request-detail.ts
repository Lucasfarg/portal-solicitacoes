import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  PoBreadcrumb,
  PoDialogService,
  PoDividerModule,
  PoInfoModule,
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
import { PortalApi } from '../core/portal-api';
import {
  ADVANCE_LABEL,
  canModify,
  DATE_TIME_FORMAT,
  isOverdue,
  nextStatusFor,
  STATUS_TAG_TYPE,
  transitionLabel,
} from './request-view';

@Component({
  selector: 'app-request-detail',
  imports: [DatePipe, PoPageModule, PoInfoModule, PoTagModule, PoDividerModule, PoTableModule],
  templateUrl: './request-detail.html',
  styleUrl: './request-detail.scss',
})
export class RequestDetailPage {
  private readonly api = inject(PortalApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(PoDialogService);
  private readonly notification = inject(PoNotificationService);

  private readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  protected readonly dateTimeFormat = DATE_TIME_FORMAT;
  protected readonly statusLabels = REQUEST_STATUS_LABELS;
  protected readonly statusTagType = STATUS_TAG_TYPE;
  protected readonly danger = PoTagType.Danger;

  protected readonly request = signal<RequestDetail | null>(null);

  protected readonly title = computed(() => {
    const request = this.request();
    return request ? `${request.code} — ${request.title}` : 'Solicitação';
  });

  protected readonly breadcrumb: PoBreadcrumb = {
    items: [{ label: 'Solicitações', link: '/solicitacoes' }, { label: 'Detalhe' }],
  };

  protected readonly overdue = computed(() => {
    const request = this.request();
    return request !== null && isOverdue(request);
  });

  // Os botões dependem de quem está vendo e da situação da solicitação:
  // o atendente avança o status; o dono edita e exclui enquanto está em Aberto.
  protected readonly actions = computed<PoPageAction[]>(() => {
    const request = this.request();
    if (!request) {
      return [];
    }
    const user = this.auth.user();
    const actions: PoPageAction[] = [];

    const next = nextStatusFor(user, request);
    if (next) {
      actions.push({ label: ADVANCE_LABEL[next], action: () => this.confirmAdvance(next) });
    }
    if (canModify(user, request)) {
      actions.push(
        {
          label: 'Editar',
          action: () => void this.router.navigate(['/solicitacoes', request.id, 'editar']),
        },
        { label: 'Excluir', type: 'danger', action: () => this.confirmRemove(request) },
      );
    }
    return actions;
  });

  protected readonly historyColumns: PoTableColumn[] = [
    { property: 'changedAt', label: 'Quando', type: 'dateTime', format: DATE_TIME_FORMAT },
    { property: 'change', label: 'O que mudou' },
    { property: 'changedBy', label: 'Quem' },
  ];

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

  private load(): void {
    this.api.getRequest(this.id).subscribe({
      next: (request) => this.request.set(request),
      // Não existe (404) ou é de outro colaborador (403): avisa e volta para a lista.
      error: (error: unknown) => {
        this.notification.error(errorMessage(error));
        void this.router.navigate(['/solicitacoes']);
      },
    });
  }

  private confirmAdvance(next: RequestStatus): void {
    this.dialog.confirm({
      title: ADVANCE_LABEL[next],
      message: `A solicitação passará para "${REQUEST_STATUS_LABELS[next]}". Essa mudança não pode ser desfeita.`,
      confirm: () => this.advance(next),
    });
  }

  private advance(next: RequestStatus): void {
    this.api.changeStatus(this.id, next).subscribe({
      next: (request) => {
        this.request.set(request);
        this.notification.success(`Situação alterada para "${REQUEST_STATUS_LABELS[next]}".`);
      },
      error: (error: unknown) => this.showConflict(error),
    });
  }

  private confirmRemove(request: RequestDetail): void {
    this.dialog.confirm({
      title: 'Excluir solicitação',
      message: `Excluir ${request.code} — ${request.title}? Essa ação não pode ser desfeita.`,
      confirm: () => this.remove(request),
    });
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

  // A API recusou (409: a situação mudou enquanto a tela estava aberta; 403: sem permissão).
  // Mostra o motivo e recarrega, para os botões refletirem o estado atual.
  private showConflict(error: unknown): void {
    this.notification.error(errorMessage(error));
    this.load();
  }
}
