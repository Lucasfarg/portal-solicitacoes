import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PoButtonModule, PoNotificationService, PoWidgetModule } from '@po-ui/ng-components';
import { DashboardSummary, RequestStatus } from '@portal/shared';
import { errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { PortalApi } from '../core/portal-api';
import { Page } from '../layout/page';

interface Card {
  label: string;
  value: string;
  help: string;
  // Filtro aplicado na lista quando o cartão é aberto (os cartões sem lista não têm).
  status?: RequestStatus | 'ALL';
}

@Component({
  selector: 'app-dashboard',
  imports: [Page, PoWidgetModule, PoButtonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly api = inject(PortalApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notification = inject(PoNotificationService);

  private readonly summary = signal<DashboardSummary | null>(null);

  // A API já devolve os números no escopo de quem está logado.
  protected readonly subtitle = computed(() =>
    this.auth.user()?.role === 'AGENT'
      ? 'Números de todas as solicitações'
      : 'Números das suas solicitações',
  );

  protected readonly cards = computed<Card[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }
    const average = summary.averageResolutionHours;
    return [
      { label: 'Total', value: String(summary.total), help: 'Todas as situações', status: 'ALL' },
      {
        label: 'Abertas',
        value: String(summary.open),
        help: 'Aguardando atendimento',
        status: 'OPEN',
      },
      {
        label: 'Em atendimento',
        value: String(summary.inProgress),
        help: 'Com um atendente trabalhando',
        status: 'IN_PROGRESS',
      },
      {
        label: 'Concluídas',
        value: String(summary.done),
        help: 'Atendimento encerrado',
        status: 'DONE',
      },
      {
        label: 'Atrasadas',
        value: String(summary.overdue),
        help: 'Não concluídas e com o prazo vencido',
      },
      {
        label: 'Tempo médio de atendimento',
        // Sem concluídas não há média; um traço não seria lido pelo leitor de tela.
        value: average === null ? 'Sem dados' : `${average.toLocaleString('pt-BR')} h`,
        help: 'Da abertura à conclusão',
      },
    ];
  });

  constructor() {
    this.api.dashboardSummary().subscribe({
      next: (summary) => this.summary.set(summary),
      error: (error: unknown) => this.notification.error(errorMessage(error)),
    });
  }

  protected openList(status: RequestStatus | 'ALL'): void {
    const queryParams = status === 'ALL' ? {} : { status };
    void this.router.navigate(['/solicitacoes'], { queryParams });
  }
}
