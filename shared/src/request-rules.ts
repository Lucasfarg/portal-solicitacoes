import type { AuthUser } from './auth.js';
import { NEXT_STATUS, type RequestStatus } from './request-status.js';

// Quem pode o quê numa solicitação. A API aplica (e responde o erro de cada motivo); o front
// usa as mesmas funções só para decidir quais botões aparecem.

export interface RequestAccess {
  requesterId: number;
  status: RequestStatus;
  // Atendente que iniciou o atendimento; nulo enquanto está em Aberto.
  assigneeId: number | null;
}

type Viewer = Pick<AuthUser, 'id' | 'role'>;

// Atendente vê todas; colaborador, só as que abriu.
export function canView(user: Viewer, request: Pick<RequestAccess, 'requesterId'>): boolean {
  return user.role === 'AGENT' || request.requesterId === user.id;
}

export type ModifyRefusal = 'NOT_REQUESTER' | 'NOT_OPEN';

// Editar e excluir: só quem abriu, e só enquanto ninguém começou a atender.
export function modifyRefusal(
  user: Viewer,
  request: Pick<RequestAccess, 'requesterId' | 'status'>,
): ModifyRefusal | null {
  if (request.requesterId !== user.id) {
    return 'NOT_REQUESTER';
  }
  return request.status === 'OPEN' ? null : 'NOT_OPEN';
}

export type StatusChangeRefusal =
  | 'NOT_AGENT'
  | 'OWN_REQUEST'
  | 'INVALID_TRANSITION'
  | 'NOT_ASSIGNEE';

// Mudar status: só atendente, nunca na solicitação que ele mesmo abriu (conflito de interesse),
// só para o próximo passo do fluxo, e só quem iniciou o atendimento o conclui.
export function statusChangeRefusal(
  user: Viewer,
  request: RequestAccess,
  to: RequestStatus,
): StatusChangeRefusal | null {
  if (user.role !== 'AGENT') {
    return 'NOT_AGENT';
  }
  if (request.requesterId === user.id) {
    return 'OWN_REQUEST';
  }
  if (NEXT_STATUS[request.status] !== to) {
    return 'INVALID_TRANSITION';
  }
  if (to === 'DONE' && request.assigneeId !== user.id) {
    return 'NOT_ASSIGNEE';
  }
  return null;
}

// Próximo status que este usuário pode aplicar, ou nulo se nenhum.
export function nextStatusFor(user: Viewer, request: RequestAccess): RequestStatus | null {
  const to = NEXT_STATUS[request.status];
  return to && !statusChangeRefusal(user, request, to) ? to : null;
}
