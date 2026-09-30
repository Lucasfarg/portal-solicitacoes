import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  PoButtonModule,
  PoNotificationService,
  PoTagModule,
  PoTagType,
} from '@po-ui/ng-components';
import { REQUEST_STATUS_LABELS, RequestDetail, RequestStatus } from '@portal/shared';
import { errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { ConfirmDialog } from '../core/confirm-dialog';
import { PortalApi } from '../core/portal-api';
import { Page } from '../layout/page';
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
  imports: [DatePipe, RouterLink, Page, ConfirmDialog, PoButtonModule, PoTagModule],
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
  private readonly page = viewChild.required(Page);

  protected readonly dateTimeFormat = DATE_TIME_FORMAT;
  protected readonly statusLabels = REQUEST_STATUS_LABELS;
  protected readonly statusTagType = STATUS_TAG_TYPE;
  protected readonly danger = PoTagType.Danger;
  protected readonly advanceLabel = ADVANCE_LABEL;

  protected readonly request = signal<RequestDetail | null>(null);

  protected readonly title = computed(() => {
    const request = this.request();
    return request ? `${request.code} — ${request.title}` : 'Solicitação';
  });

  protected readonly overdue = computed(() => {
    const request = this.request();
    return request !== null && isOverdue(request);
  });

  // Os botões dependem de quem está vendo e da situação da solicitação:
  // o atendente avança o status; o dono edita e exclui enquanto está em Aberto.
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

  protected edit(): void {
    void this.router.navigate(['/solicitacoes', this.id, 'editar']);
  }

  protected confirmAdvance(next: RequestStatus): void {
    this.dialog().ask(
      {
        title: ADVANCE_LABEL[next],
        message: `A solicitação passará para "${REQUEST_STATUS_LABELS[next]}". Essa mudança não pode ser desfeita.`,
      },
      () => this.advance(next),
    );
  }

  private advance(next: RequestStatus): void {
    this.api.changeStatus(this.id, next).subscribe({
      next: (request) => {
        this.request.set(request);
        this.notification.success(`Situação alterada para "${REQUEST_STATUS_LABELS[next]}".`);
        // O botão que tinha o foco muda de nome ou some (não há status depois de Concluído).
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

  // A API recusou (409: a situação mudou enquanto a tela estava aberta; 403: sem permissão).
  // Mostra o motivo e recarrega, para os botões refletirem o estado atual.
  private showConflict(error: unknown): void {
    this.notification.error(errorMessage(error));
    this.load();
    this.page().focusTitle();
  }
}
