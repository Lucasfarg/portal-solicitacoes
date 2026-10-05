import { formatRequestCode, type RequestDetail, type RequestSummary } from '@portal/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { isOverdue } from './request-rules.js';

// O que cada consulta traz junto da solicitação, e a conversão da linha do banco
// para o formato da resposta (schemas de shared/).

const PERSON = { select: { id: true, name: true } } as const;

export const WITH_NAMES = {
  category: { select: { id: true, name: true } },
  requester: PERSON,
  assignee: PERSON,
} satisfies Prisma.RequestInclude;

export const WITH_HISTORY = {
  ...WITH_NAMES,
  history: {
    select: { fromStatus: true, toStatus: true, changedAt: true, changedBy: PERSON },
    orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.RequestInclude;

// A lista não lê a descrição: nenhuma linha da tela a mostra.
type RequestRow = Prisma.RequestGetPayload<{
  include: typeof WITH_NAMES;
  omit: { description: true };
}>;
export type RequestDetailRow = Prisma.RequestGetPayload<{ include: typeof WITH_HISTORY }>;

// `now` é o instante da requisição: o mesmo para todas as linhas e para o filtro.
export function toRequestSummary(row: RequestRow, now: Date): RequestSummary {
  return {
    id: row.id,
    // O código não é coluna: sai do id a cada resposta.
    code: formatRequestCode(row.id),
    title: row.title,
    status: row.status,
    category: row.category,
    requester: row.requester,
    assignee: row.assignee,
    dueAt: row.dueAt.toISOString(),
    overdue: isOverdue(row, now),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toRequestDetail(row: RequestDetailRow, now: Date): RequestDetail {
  return {
    ...toRequestSummary(row, now),
    description: row.description,
    history: row.history.map((entry) => ({
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      changedBy: entry.changedBy,
      changedAt: entry.changedAt.toISOString(),
    })),
  };
}
