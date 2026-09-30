import { PoTagType } from '@po-ui/ng-components';
import {
  AuthUser,
  NEXT_STATUS,
  REQUEST_STATUS_LABELS,
  RequestDto,
  RequestStatus,
} from '@portal/shared';

// O que as telas de solicitação têm em comum: cores, prazo e o que cada pessoa pode fazer.
// As permissões aqui só decidem quais botões aparecem; quem garante a regra é a API.

export const DATE_TIME_FORMAT = 'dd/MM/yyyy HH:mm';

export const STATUS_TAG_TYPE: Record<RequestStatus, PoTagType> = {
  OPEN: PoTagType.Info,
  IN_PROGRESS: PoTagType.Warning,
  DONE: PoTagType.Success,
};

// Mesma definição do dashboard da API: ainda não concluída e com o prazo vencido.
export function isOverdue(request: Pick<RequestDto, 'status' | 'dueAt'>, now = new Date()) {
  return request.status !== 'DONE' && new Date(request.dueAt) < now;
}

// Editar e excluir: só quem abriu, e só enquanto está em Aberto.
export function canModify(user: AuthUser | null, request: RequestDto): boolean {
  return request.requester.id === user?.id && request.status === 'OPEN';
}

// Próximo status que este usuário pode aplicar: só o atendente avança o fluxo.
export function nextStatusFor(user: AuthUser | null, request: RequestDto): RequestStatus | null {
  return user?.role === 'AGENT' ? NEXT_STATUS[request.status] : null;
}

export const ADVANCE_LABEL: Record<RequestStatus, string> = {
  OPEN: '',
  IN_PROGRESS: 'Iniciar atendimento',
  DONE: 'Concluir atendimento',
};

// Texto de uma linha do histórico: "Aberto → Em Atendimento" (ou só "Aberto" na abertura).
export function transitionLabel(from: RequestStatus | null, to: RequestStatus): string {
  return from
    ? `${REQUEST_STATUS_LABELS[from]} → ${REQUEST_STATUS_LABELS[to]}`
    : `Solicitação aberta (${REQUEST_STATUS_LABELS[to]})`;
}
