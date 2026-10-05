import { Component, computed, inject, signal } from '@angular/core';
import { Params, Router } from '@angular/router';
import {
  PoButtonKind,
  PoButtonModule,
  PoChartModule,
  PoChartOptions,
  PoChartSerie,
  PoChartType,
  PoPageModule,
  PoWidgetModule,
} from '@po-ui/ng-components';
import { DashboardSummary, REQUEST_STATUS_LABELS } from '@portal/shared';
import { errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { ChartA11y, PageA11y } from '../core/po-a11y';
import { PortalApi } from '../core/portal-api';
import { LoadState } from '../layout/load-state';
import { OVERDUE_LABEL } from '../requests/request-view';

interface Card {
  label: string;
  value: string;
  help: string;
  filter?: Params;
}

const STATUS_COLORS = { open: '#1f6fb2', inProgress: '#b86e00', done: '#2e7d5b' };

@Component({
  selector: 'app-dashboard',
  imports: [
    LoadState,
    PoPageModule,
    PoWidgetModule,
    PoButtonModule,
    PoChartModule,
    PageA11y,
    ChartA11y,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly api = inject(PortalApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly donut = PoChartType.Donut;
  protected readonly bar = PoChartType.Bar;
  protected readonly tertiary = PoButtonKind.tertiary;
  private readonly chartHeader = { hideExpand: true, hideExportCsv: true, hideExportImage: true };
  protected readonly donutOptions: PoChartOptions = {
    legend: true,
    innerRadius: 62,
    header: this.chartHeader,
  };
  protected readonly barOptions: PoChartOptions = { legend: false, header: this.chartHeader };

  protected readonly subtitle = computed(() =>
    this.auth.user()?.role === 'AGENT'
      ? 'Números de todas as solicitações'
      : 'Números das suas solicitações',
  );

  protected readonly statusCards = computed<Card[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }
    return [
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
      { label: 'Total', value: String(summary.total), help: 'Todas as situações', filter: {} },
    ];
  });

  protected readonly deadlineCards = computed<Card[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }
    return [
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

  protected readonly statusSeries = computed<PoChartSerie[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }
    return [
      { label: REQUEST_STATUS_LABELS.OPEN, data: summary.open, color: STATUS_COLORS.open },
      {
        label: REQUEST_STATUS_LABELS.IN_PROGRESS,
        data: summary.inProgress,
        color: STATUS_COLORS.inProgress,
      },
      { label: REQUEST_STATUS_LABELS.DONE, data: summary.done, color: STATUS_COLORS.done },
    ];
  });

  // O gráfico de barras desenha de baixo para cima: invertida, a maior categoria fica no alto.
  private readonly categories = computed(() => [...(this.summary()?.byCategory ?? [])].reverse());
  protected readonly categoryNames = computed(() =>
    this.categories().map((category) => category.name),
  );
  protected readonly categorySeries = computed<PoChartSerie[]>(() => [
    {
      label: 'Solicitações',
      data: this.categories().map((category) => category.total),
      color: '#0e6b7a',
    },
  ]);

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

  protected newRequest(): void {
    void this.router.navigate(['/solicitacoes/nova']);
  }

  protected openList(filter: Params): void {
    void this.router.navigate(['/solicitacoes'], { queryParams: filter });
  }
}

// Sempre em horas úteis, sem virar dias. Sem média, um texto em vez de traço, que o leitor
// de tela não leria.
function formatAverage(hours: number | null): string {
  if (hours === null) {
    return 'Sem dados';
  }
  return `${hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h úteis`;
}
