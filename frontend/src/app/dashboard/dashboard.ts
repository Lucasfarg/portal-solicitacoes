import { Component, computed, inject, signal } from '@angular/core';
import { Params, Router } from '@angular/router';
import { PoButtonModule, PoPageModule, PoWidgetModule } from '@po-ui/ng-components';
import { DashboardSummary, REQUEST_STATUS_LABELS } from '@portal/shared';
import { errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { PageA11y } from '../core/po-a11y';
import { PortalApi } from '../core/portal-api';
import { LoadState } from '../layout/load-state';
import { OVERDUE_LABEL } from '../requests/request-view';

interface Card {
  label: string;
  value: string;
  help: string;
  // Filtro aplicado na lista quando o cartão é aberto (os tempos médios e as concluídas
  // fora do prazo não têm lista).
  filter?: Params;
}

@Component({
  selector: 'app-dashboard',
  imports: [LoadState, PoPageModule, PoWidgetModule, PoButtonModule, PageA11y],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly api = inject(PortalApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly summary = signal<DashboardSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

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
    // Os cartões de status usam o mesmo nome da etiqueta e do filtro da lista.
    return [
      { label: 'Total', value: String(summary.total), help: 'Todas as situações', filter: {} },
      {
        label: REQUEST_STATUS_LABELS.OPEN,
        value: String(summary.open),
        help: 'Aguardando atendimento',
        filter: { status: 'OPEN' },
      },
      {
        label: REQUEST_STATUS_LABELS.IN_PROGRESS,
        value: String(summary.inProgress),
        help: 'Com um atendente responsável',
        filter: { status: 'IN_PROGRESS' },
      },
      {
        label: REQUEST_STATUS_LABELS.DONE,
        value: String(summary.done),
        help: 'Atendimento concluído',
        filter: { status: 'DONE' },
      },
      {
        label: OVERDUE_LABEL,
        value: String(summary.overdue),
        help: 'Não concluídas e com o prazo vencido',
        filter: { overdue: 'true' },
      },
      {
        label: 'Concluídas fora do prazo',
        value: String(summary.completedLate),
        help: 'Concluídas depois do prazo',
      },
      {
        label: 'Tempo médio até o início',
        value: formatAverage(summary.averageTimeToStartHours),
        help: 'Da abertura ao início do atendimento, só no expediente',
      },
      {
        label: 'Tempo médio até a conclusão',
        value: formatAverage(summary.averageResolutionHours),
        help: 'Da abertura à conclusão, só no expediente',
      },
    ];
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.dashboardSummary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(errorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected openList(filter: Params): void {
    void this.router.navigate(['/solicitacoes'], { queryParams: filter });
  }
}

// Sempre em horas úteis ("12,5 h úteis"), sem virar dias: 24 h úteis são mais de dois dias de
// expediente. Sem nenhuma solicitação no ponto medido não há média; um traço não seria lido
// pelo leitor de tela.
function formatAverage(hours: number | null): string {
  if (hours === null) {
    return 'Sem dados';
  }
  return `${hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h úteis`;
}
