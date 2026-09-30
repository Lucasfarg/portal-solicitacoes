import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  type AuthUser,
  NEXT_STATUS,
  REQUEST_STATUS_LABELS,
  type RequestStatus,
} from '@portal/shared';

// Regras de negócio das solicitações, em funções puras (sem banco): quem pode o quê,
// quais mudanças de status valem, como o prazo e o período do filtro são calculados.

interface OwnedRequest {
  requesterId: number;
  status: RequestStatus;
}

// Filtro aplicado a toda consulta de lista: atendente vê todas; colaborador, só as que abriu.
export function visibleTo(user: AuthUser): { requesterId?: number } {
  return user.role === 'AGENT' ? {} : { requesterId: user.id };
}

export function canView(user: AuthUser, request: OwnedRequest): boolean {
  return user.role === 'AGENT' || request.requesterId === user.id;
}

export function assertCanView(user: AuthUser, request: OwnedRequest): void {
  if (!canView(user, request)) {
    throw new ForbiddenException('Esta solicitação pertence a outro colaborador');
  }
}

// Editar e excluir: só quem abriu, e só enquanto ninguém começou a atender.
export function assertCanModify(user: AuthUser, request: OwnedRequest): void {
  if (request.requesterId !== user.id) {
    throw new ForbiddenException('Só quem abriu a solicitação pode alterá-la ou excluí-la');
  }
  if (request.status !== 'OPEN') {
    throw new ConflictException(
      `A solicitação está em "${REQUEST_STATUS_LABELS[request.status]}" e só pode ser alterada ou excluída em "${REQUEST_STATUS_LABELS.OPEN}"`,
    );
  }
}

// Mudar status: só atendente, e só para o próximo passo do fluxo.
export function assertCanChangeStatus(user: AuthUser, from: RequestStatus, to: RequestStatus) {
  if (user.role !== 'AGENT') {
    throw new ForbiddenException('Só atendentes alteram o status de uma solicitação');
  }
  if (NEXT_STATUS[from] !== to) {
    throw new ConflictException(
      `Transição inválida: de "${REQUEST_STATUS_LABELS[from]}" não é possível ir para "${REQUEST_STATUS_LABELS[to]}"`,
    );
  }
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// Prazo de atendimento: abertura + SLA da categoria.
export function dueDate(openedAt: Date, slaHours: number): Date {
  return new Date(openedAt.getTime() + slaHours * HOUR_MS);
}

// Fortaleza está em UTC-3 o ano inteiro (o Brasil não tem horário de verão desde 2019).
const FORTALEZA_OFFSET = '-03:00';

// O filtro chega em datas de Fortaleza (AAAA-MM-DD) e o banco guarda UTC. O período vira
// [início do primeiro dia, início do dia seguinte ao último): o último dia entra inteiro.
export function periodToUtcRange(from?: string, to?: string): { gte?: Date; lt?: Date } {
  const startOfDay = (date: string) => new Date(`${date}T00:00:00${FORTALEZA_OFFSET}`);
  return {
    gte: from ? startOfDay(from) : undefined,
    lt: to ? new Date(startOfDay(to).getTime() + DAY_MS) : undefined,
  };
}
