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

// Regras de negócio das solicitações, em funções puras (sem banco): os erros de cada recusa
// (as regras de quem pode o quê ficam em shared/, para o front usar as mesmas), como o prazo,
// as horas úteis e o período do filtro são calculados.

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

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// ---------- Datas no fuso da empresa (APP_TIMEZONE), só com Intl ----------

// Um formatador por fuso: construir um Intl.DateTimeFormat custa mais que usá-lo, e o prazo
// consulta o relógio local várias vezes por dia percorrido.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

// Data (AAAA-MM-DD) e hora que o relógio local marca, no fuso, num instante.
function wallClock(instant: number, timeZone: string): { date: string; time: string } {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}:${part('second')}`,
  };
}

// Quanto o relógio local está à frente do UTC naquele instante (Fortaleza: -3 h).
function offsetMs(instant: number, timeZone: string): number {
  const { date, time } = wallClock(instant, timeZone);
  return Date.parse(`${date}T${time}Z`) - instant;
}

// Instante em que o relógio local marca `hour`:00 do dia `date`. Chuta com o offset daquela
// hora lida como UTC e confere com o offset do instante achado: num dia de mudança de
// horário (horário de verão) os dois diferem, e vale o segundo. Uma hora que não existe
// (pulada quando o relógio adianta) cai uma hora antes.
function zonedInstant(date: string, hour: number, timeZone: string): number {
  const asUtc = Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  const guess = asUtc - offsetMs(asUtc, timeZone);
  return asUtc - offsetMs(guess, timeZone);
}

function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

// Expediente: segunda a sexta, das 08:00 às 18:00 no fuso da empresa (feriados não entram).
const WORKDAY_START_HOUR = 8;
const WORKDAY_END_HOUR = 18;

function isWeekday(date: string): boolean {
  // Dia da semana da data do calendário: 0 = domingo, 6 = sábado.
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

// Prazo de atendimento: o SLA da categoria conta só horas de expediente, a partir da abertura.
// Aberta fora do expediente, começa a contar no próximo início de expediente.
export function dueDate(openedAt: Date, slaHours: number, timeZone: string): Date {
  let remainingMs = slaHours * HOUR_MS;
  let due = openedAt.getTime();
  let day = wallClock(due, timeZone).date;
  // Percorre os dias a partir da abertura, gastando as horas de expediente de cada um.
  while (remainingMs > 0) {
    if (isWeekday(day)) {
      const start = Math.max(due, zonedInstant(day, WORKDAY_START_HOUR, timeZone));
      const end = zonedInstant(day, WORKDAY_END_HOUR, timeZone);
      const used = Math.min(remainingMs, Math.max(0, end - start));
      due = start + used;
      remainingMs -= used;
    }
    day = nextDay(day);
  }
  return new Date(due);
}

// Horas de expediente entre dois instantes (a mesma régua do prazo). Usada no painel: o tempo
// até o início e até a conclusão não contam noite nem fim de semana.
export function businessHoursBetween(start: Date, end: Date, timeZone: string): number {
  let totalMs = 0;
  let day = wallClock(start.getTime(), timeZone).date;
  const lastDay = wallClock(end.getTime(), timeZone).date;
  while (day <= lastDay) {
    if (isWeekday(day)) {
      const from = Math.max(start.getTime(), zonedInstant(day, WORKDAY_START_HOUR, timeZone));
      const to = Math.min(end.getTime(), zonedInstant(day, WORKDAY_END_HOUR, timeZone));
      totalMs += Math.max(0, to - from);
    }
    day = nextDay(day);
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
  return {
    gte: from ? new Date(zonedInstant(from, 0, timeZone)) : undefined,
    lt: to ? new Date(zonedInstant(nextDay(to), 0, timeZone)) : undefined,
  };
}
