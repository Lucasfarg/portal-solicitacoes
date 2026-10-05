import { PoTagType } from '@po-ui/ng-components';
import {
  accessOf,
  AuthUser,
  modifyRefusal,
  REQUEST_STATUS_LABELS,
  RequestStatus,
  RequestSummary,
  nextStatusFor as sharedNextStatusFor,
} from '@portal/shared';

// As permissões vêm de shared/ e aqui só decidem quais botões aparecem; quem garante a regra é
// a API.

export const DATE_TIME_FORMAT = 'dd/MM/yyyy HH:mm';

export const STATUS_TAG_TYPE: Record<RequestStatus, PoTagType> = {
  OPEN: PoTagType.Info,
  IN_PROGRESS: PoTagType.Warning,
  DONE: PoTagType.Success,
};

// O mesmo nome vai no menu, no título da lista e na trilha de navegação.
export function listTitle(user: AuthUser | null): string {
  return user?.role === 'AGENT' ? 'Solicitações' : 'Minhas solicitações';
}

// "Fora do prazo" combina com qualquer status, sem o gênero de "atrasada".
export const OVERDUE_LABEL = 'Fora do prazo';

// O prazo conta só horas úteis (segunda a sexta, 08:00–18:00), por isso não vira dias.
export function formatHours(hours: number): string {
  return hours === 1 ? '1 hora útil' : `${hours} horas úteis`;
}

export function canModify(user: AuthUser | null, request: RequestSummary): boolean {
  return user !== null && modifyRefusal(user, accessOf(request)) === null;
}

export function nextStatusFor(
  user: AuthUser | null,
  request: RequestSummary,
): RequestStatus | null {
  return user ? sharedNextStatusFor(user, accessOf(request)) : null;
}

export function assigneeName(request: RequestSummary): string {
  return request.assignee?.name ?? 'Ninguém ainda';
}

export const ADVANCE_LABEL: Record<RequestStatus, string> = {
  OPEN: '',
  IN_PROGRESS: 'Iniciar atendimento',
  DONE: 'Concluir atendimento',
};

export function transitionLabel(from: RequestStatus | null, to: RequestStatus): string {
  return from
    ? `${REQUEST_STATUS_LABELS[from]} → ${REQUEST_STATUS_LABELS[to]}`
    : 'Solicitação aberta';
}
