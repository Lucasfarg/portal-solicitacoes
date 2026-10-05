import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  type AuthUser,
  canView,
  modifyRefusal,
  REQUEST_STATUS_LABELS,
  type RequestAccess,
  type RequestStatus,
  statusChangeRefusal,
} from '@portal/shared';
import { DateTime } from 'luxon';

export function visibleTo(user: AuthUser): { requesterId?: number } {
  return user.role === 'AGENT' ? {} : { requesterId: user.id };
}

// 404 e não 403: quem não pode ver não fica sabendo que o número existe.
export function assertCanView(user: AuthUser, request: Pick<RequestAccess, 'requesterId'>): void {
  if (!canView(user, request)) {
    throw new NotFoundException('Solicitação não encontrada');
  }
}

export function assertCanModify(
  user: AuthUser,
  request: Pick<RequestAccess, 'requesterId' | 'status'>,
): void {
  assertCanView(user, request);
  const refusal = modifyRefusal(user, request);
  if (refusal === 'NOT_REQUESTER') {
    throw new ForbiddenException('Só quem abriu a solicitação pode alterá-la ou excluí-la');
  }
  if (refusal === 'NOT_OPEN') {
    throw new ConflictException(
      `A solicitação está em "${REQUEST_STATUS_LABELS[request.status]}" e só pode ser alterada ou excluída em "${REQUEST_STATUS_LABELS.OPEN}"`,
    );
  }
}

export function assertCanChangeStatus(
  user: AuthUser,
  request: RequestAccess,
  to: RequestStatus,
): void {
  assertCanView(user, request);
  switch (statusChangeRefusal(user, request, to)) {
    case 'NOT_AGENT':
      throw new ForbiddenException('Só atendentes alteram o status de uma solicitação');
    case 'OWN_REQUEST':
      throw new ForbiddenException(
        'Atendente não altera o status de uma solicitação que ele mesmo abriu',
      );
    case 'INVALID_TRANSITION':
      throw new ConflictException(
        `Transição inválida: de "${REQUEST_STATUS_LABELS[request.status]}" não é possível ir para "${REQUEST_STATUS_LABELS[to]}"`,
      );
    case 'NOT_ASSIGNEE':
      throw new ForbiddenException('Só o responsável pelo atendimento pode concluí-lo');
    case null:
      return;
  }
}

// Mesma regra do painel (SQL) e do filtro da lista, com o instante medido pela API.
export function isOverdue(request: { status: RequestStatus; dueAt: Date }, now: Date): boolean {
  return request.status !== 'DONE' && request.dueAt < now;
}

export function overdueWhere(now: Date) {
  return [{ status: { not: 'DONE' as const } }, { dueAt: { lt: now } }];
}

const HOUR_MS = 3_600_000;

// Expediente: segunda a sexta, 08:00 às 18:00; feriados não entram.
const WORKDAY_START_HOUR = 8;
const WORKDAY_END_HOUR = 18;

const isWeekday = (day: DateTime) => day.weekday <= 5;

function workday(day: DateTime): { start: number; end: number } {
  return {
    start: day.set({ hour: WORKDAY_START_HOUR }).toMillis(),
    end: day.set({ hour: WORKDAY_END_HOUR }).toMillis(),
  };
}

// Aberta fora do expediente, o prazo começa a contar no próximo início.
export function dueDate(openedAt: Date, slaHours: number, timeZone: string): Date {
  let remainingMs = slaHours * HOUR_MS;
  let due = openedAt.getTime();
  let day = DateTime.fromJSDate(openedAt, { zone: timeZone }).startOf('day');
  while (remainingMs > 0) {
    if (isWeekday(day)) {
      const { start, end } = workday(day);
      const from = Math.max(due, start);
      const used = Math.min(remainingMs, Math.max(0, end - from));
      due = from + used;
      remainingMs -= used;
    }
    day = day.plus({ days: 1 });
  }
  return new Date(due);
}

// Mesma régua do prazo: noite e fim de semana não contam.
export function businessHoursBetween(start: Date, end: Date, timeZone: string): number {
  let totalMs = 0;
  let day = DateTime.fromJSDate(start, { zone: timeZone }).startOf('day');
  const lastDay = DateTime.fromJSDate(end, { zone: timeZone }).startOf('day');
  while (day <= lastDay) {
    if (isWeekday(day)) {
      const hours = workday(day);
      const from = Math.max(start.getTime(), hours.start);
      const to = Math.min(end.getTime(), hours.end);
      totalMs += Math.max(0, to - from);
    }
    day = day.plus({ days: 1 });
  }
  return totalMs / HOUR_MS;
}

// O período vira [início do primeiro dia, início do dia seguinte ao último): o último dia entra inteiro.
export function periodToUtcRange(
  timeZone: string,
  from?: string,
  to?: string,
): { gte?: Date; lt?: Date } {
  const startOfDay = (date: string) => DateTime.fromISO(date, { zone: timeZone }).startOf('day');
  return {
    gte: from ? startOfDay(from).toJSDate() : undefined,
    lt: to ? startOfDay(to).plus({ days: 1 }).toJSDate() : undefined,
  };
}
