import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser, DashboardSummary } from '@portal/shared';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { businessHoursBetween, visibleTo } from '../requests/request-rules.js';

interface Counts {
  total: number;
  open: number;
  inProgress: number;
  done: number;
  overdue: number;
}

// Horas com uma casa decimal; nulo (nenhum registro) continua nulo.
function averageHours(hours: number[]): number | null {
  if (hours.length === 0) {
    return null;
  }
  const average = hours.reduce((sum, value) => sum + value, 0) / hours.length;
  return Math.round(average * 10) / 10;
}

@Injectable()
export class DashboardService {
  // Fuso do expediente: os tempos médios contam horas úteis, como o prazo.
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.timeZone = config.get('APP_TIMEZONE', { infer: true });
  }

  async summary(user: AuthUser): Promise<DashboardSummary> {
    // Mesmo escopo da listagem (visibleTo): atendente enxerga todas; colaborador, só as que
    // abriu. As excluídas não entram em nenhum número.
    const { requesterId } = visibleTo(user);
    const scope =
      requesterId === undefined
        ? Prisma.sql`r.deleted_at IS NULL`
        : Prisma.sql`r.deleted_at IS NULL AND r.requester_id = ${requesterId}`;

    // Uma passada pela tabela conta tudo; fora do prazo = ainda não concluída e com o prazo
    // vencido. O instante vem da API, não do now() do banco: a mesma régua da lista
    // (request-rules.ts, isOverdue).
    const now = new Date();
    const [counts] = await this.prisma.$queryRaw<Counts[]>`
      SELECT
        COUNT(*)::int                                                        AS "total",
        COUNT(*) FILTER (WHERE r.status = 'OPEN')::int                       AS "open",
        COUNT(*) FILTER (WHERE r.status = 'IN_PROGRESS')::int                AS "inProgress",
        COUNT(*) FILTER (WHERE r.status = 'DONE')::int                       AS "done",
        COUNT(*) FILTER (WHERE r.status <> 'DONE' AND r.due_at < ${now})::int AS "overdue"
      FROM requests r
      WHERE ${scope}`;

    // Os tempos saem do histórico: cada solicitação tem no máximo um registro de início
    // (IN_PROGRESS) e um de conclusão (DONE). Contam só horas úteis, a régua do prazo: aberta
    // na sexta às 17h e iniciada na segunda às 9h esperou 2 h, não 64 h. O cálculo do
    // expediente (dia da semana e fuso) fica no TypeScript, onde o prazo já é calculado.
    const entries = await this.prisma.requestStatusHistory.findMany({
      where: {
        toStatus: { in: ['IN_PROGRESS', 'DONE'] },
        request: { ...visibleTo(user), deletedAt: null },
      },
      select: {
        toStatus: true,
        changedAt: true,
        request: { select: { createdAt: true, dueAt: true } },
      },
    });

    const sinceOpening = (entry: (typeof entries)[number]) =>
      businessHoursBetween(entry.request.createdAt, entry.changedAt, this.timeZone);
    const started = entries.filter((entry) => entry.toStatus === 'IN_PROGRESS');
    const finished = entries.filter((entry) => entry.toStatus === 'DONE');

    return {
      ...counts,
      // Concluída com atraso = registro de conclusão depois do prazo.
      completedLate: finished.filter((entry) => entry.changedAt > entry.request.dueAt).length,
      averageTimeToStartHours: averageHours(started.map(sinceOpening)),
      averageResolutionHours: averageHours(finished.map(sinceOpening)),
    };
  }
}
