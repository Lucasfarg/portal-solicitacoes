import { z } from 'zod';

export const REQUEST_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE'] as const;

export const requestStatusSchema = z.enum(REQUEST_STATUSES);

export type RequestStatus = z.infer<typeof requestStatusSchema>;

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em Atendimento',
  DONE: 'Concluído',
};

// Fluxo do atendimento: cada status só avança para o seguinte, sem pular e sem voltar.
// A API usa para validar a transição; o front, para saber qual botão mostrar.
export const NEXT_STATUS: Record<RequestStatus, RequestStatus | null> = {
  OPEN: 'IN_PROGRESS',
  IN_PROGRESS: 'DONE',
  DONE: null,
};
