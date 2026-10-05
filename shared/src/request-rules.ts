import type { AuthUser } from './auth.js';
import { NEXT_STATUS, type RequestStatus } from './request-status.js';

// A API aplica estas regras; o front usa as mesmas funções só para mostrar os botões.

export interface RequestAccess {
  requesterId: number;
  status: RequestStatus;
  assigneeId: number | null;
}

type Viewer = Pick<AuthUser, 'id' | 'role'>;

export function canView(user: Viewer, request: Pick<RequestAccess, 'requesterId'>): boolean {
  return user.role === 'AGENT' || request.requesterId === user.id;
}

export type ModifyRefusal = 'NOT_REQUESTER' | 'NOT_OPEN';

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

// Atendente nunca muda a que ele mesmo abriu (conflito de interesse); só quem iniciou conclui.
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

export function nextStatusFor(user: Viewer, request: RequestAccess): RequestStatus | null {
  const to = NEXT_STATUS[request.status];
  return to && !statusChangeRefusal(user, request, to) ? to : null;
}
