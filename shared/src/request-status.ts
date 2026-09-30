import { z } from 'zod';

export const REQUEST_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE'] as const;

export const requestStatusSchema = z.enum(REQUEST_STATUSES);

export type RequestStatus = z.infer<typeof requestStatusSchema>;

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em Atendimento',
  DONE: 'Concluído',
};
