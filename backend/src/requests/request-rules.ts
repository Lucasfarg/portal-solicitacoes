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

// Regras de negócio das solicitações, em funções puras (sem banco): os erros de cada recusa
// (as regras de quem pode o quê ficam em shared/, para o front usar as mesmas), como o prazo,
// as horas úteis e o período do filtro são calculados (as contas de data e fuso são do Luxon).

// Filtro aplicado a toda consulta de lista e ao painel: atendente vê todas; colaborador, só as
// que abriu. É a mesma regra de canView (shared/), no formato do Prisma.
export function visibleTo(user: AuthUser): { requesterId?: number } {
  return user.role === 'AGENT' ? {} : { requesterId: user.id };
}

// 404, e não 403: quem não pode ver a solicitação não fica sabendo que aquele número existe.
export function assertCanView(user: AuthUser, request: Pick<RequestAccess, 'requesterId'>): void {
  if (!canView(user, request)) {
    throw new NotFoundException('Solicitação não encontrada');
  }
}

// Editar e excluir: a regra está em modifyRefusal (shared/); aqui cada motivo vira um erro.
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

// Mudar status: a regra está em statusChangeRefusal (shared/); aqui cada motivo vira um erro.
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

// Fora do prazo: ainda não concluída e com o prazo vencido. O painel usa a mesma regra em SQL
// e o filtro da lista em Prisma (overdueWhere), todos com o instante medido pela API.
export function isOverdue(request: { status: RequestStatus; dueAt: Date }, now: Date): boolean {
  return request.status !== 'DONE' && request.dueAt < now;
}

export function overdueWhere(now: Date) {
  return [{ status: { not: 'DONE' as const } }, { dueAt: { lt: now } }];
}

// ---------- Datas no fuso da empresa (APP_TIMEZONE), com o Luxon ----------

const HOUR_MS = 3_600_000;

// Expediente: segunda a sexta, das 08:00 às 18:00 no fuso da empresa (feriados não entram).
const WORKDAY_START_HOUR = 8;
const WORKDAY_END_HOUR = 18;

// No Luxon, weekday vai de 1 (segunda) a 7 (domingo).
const isWeekday = (day: DateTime) => day.weekday <= 5;

// Início e fim do expediente de um dia, em milissegundos.
function workday(day: DateTime): { start: number; end: number } {
  return {
    start: day.set({ hour: WORKDAY_START_HOUR }).toMillis(),
    end: day.set({ hour: WORKDAY_END_HOUR }).toMillis(),
  };
}

// Prazo de atendimento: o SLA da categoria conta só horas de expediente, a partir da abertura.
// Aberta fora do expediente, começa a contar no próximo início de expediente.
export function dueDate(openedAt: Date, slaHours: number, timeZone: string): Date {
  let remainingMs = slaHours * HOUR_MS;
  let due = openedAt.getTime();
  let day = DateTime.fromJSDate(openedAt, { zone: timeZone }).startOf('day');
  // Percorre os dias a partir da abertura, gastando as horas de expediente de cada um.
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

// Horas de expediente entre dois instantes (a mesma régua do prazo). Usada no painel: o tempo
// até o início e até a conclusão não contam noite nem fim de semana.
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

// O filtro chega em datas do fuso da empresa (AAAA-MM-DD) e o banco guarda UTC. O período
// vira [início do primeiro dia, início do dia seguinte ao último): o último dia entra inteiro.
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
