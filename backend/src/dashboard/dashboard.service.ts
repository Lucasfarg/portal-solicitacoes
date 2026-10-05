import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser, DashboardSummary, RequestStatus } from '@portal/shared';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { businessHoursBetween, overdueWhere, visibleTo } from '../requests/request-rules.js';

function averageHours(hours: number[]): number | null {
  if (hours.length === 0) {
    return null;
  }
  const average = hours.reduce((sum, value) => sum + value, 0) / hours.length;
  return Math.round(average * 10) / 10;
}

@Injectable()
export class DashboardService {
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.timeZone = config.get('APP_TIMEZONE', { infer: true });
  }

  async summary(user: AuthUser): Promise<DashboardSummary> {
    // Mesmo escopo da listagem; as excluídas não entram.
    const where = { ...visibleTo(user), deletedAt: null };
    const now = new Date();

    const [byStatus, overdue, categories] = await Promise.all([
      this.prisma.request.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.request.count({ where: { ...where, AND: overdueWhere(now) } }),
      this.prisma.category.findMany({
        select: { name: true, _count: { select: { requests: { where } } } },
      }),
    ]);

    const countOf = (status: RequestStatus) =>
      byStatus.find((group) => group.status === status)?._count ?? 0;
    const counts = {
      total: byStatus.reduce((sum, group) => sum + group._count, 0),
      open: countOf('OPEN'),
      inProgress: countOf('IN_PROGRESS'),
      done: countOf('DONE'),
      overdue,
    };
    const byCategory = categories
      .map((category) => ({ name: category.name, total: category._count.requests }))
      .filter((category) => category.total > 0)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    // Só horas úteis, como o prazo: aberta na sexta 17h e iniciada na segunda 9h esperou 2 h, não 64 h.
    // O cálculo do expediente fica no TypeScript, onde o prazo já é calculado.
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
      byCategory,
      completedLate: finished.filter((entry) => entry.changedAt > entry.request.dueAt).length,
      averageTimeToStartHours: averageHours(started.map(sinceOpening)),
      averageResolutionHours: averageHours(finished.map(sinceOpening)),
    };
  }
}
