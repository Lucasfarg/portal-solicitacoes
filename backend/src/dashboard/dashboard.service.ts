import { Injectable } from '@nestjs/common';
import type { AuthUser, DashboardSummary } from '@portal/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface Counts {
  total: number;
  open: number;
  inProgress: number;
  done: number;
  overdue: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: AuthUser): Promise<DashboardSummary> {
    // Mesmo escopo da listagem: atendente enxerga todas; colaborador, só as que abriu.
    const scope =
      user.role === 'AGENT' ? Prisma.sql`TRUE` : Prisma.sql`r.requester_id = ${user.id}`;

    // Uma passada pela tabela conta tudo; atrasada = ainda não concluída e com o prazo vencido.
    const [counts] = await this.prisma.$queryRaw<Counts[]>`
      SELECT
        COUNT(*)::int                                                        AS "total",
        COUNT(*) FILTER (WHERE r.status = 'OPEN')::int                       AS "open",
        COUNT(*) FILTER (WHERE r.status = 'IN_PROGRESS')::int                AS "inProgress",
        COUNT(*) FILTER (WHERE r.status = 'DONE')::int                       AS "done",
        COUNT(*) FILTER (WHERE r.status <> 'DONE' AND r.due_at < now())::int AS "overdue"
      FROM requests r
      WHERE ${scope}`;

    // Tempo de atendimento de cada concluída: da abertura até o registro de conclusão
    // no histórico. A média sai em horas (nula se ainda não há concluídas).
    const [average] = await this.prisma.$queryRaw<{ hours: number | null }[]>`
      SELECT (EXTRACT(EPOCH FROM AVG(h.changed_at - r.created_at)) / 3600)::float8 AS "hours"
      FROM request_status_history h
      JOIN requests r ON r.id = h.request_id
      WHERE h.to_status = 'DONE' AND ${scope}`;

    return {
      ...counts,
      averageResolutionHours: average.hours === null ? null : Math.round(average.hours * 10) / 10,
    };
  }
}
