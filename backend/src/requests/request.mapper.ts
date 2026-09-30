import { formatRequestCode, type RequestDetail, type RequestDto } from '@portal/shared';
import type { Prisma } from '../generated/prisma/client.js';

// O que cada consulta traz junto da solicitação, e a conversão da linha do banco
// para o formato da resposta (schemas de shared/).

const PERSON = { select: { id: true, name: true } } as const;

export const WITH_NAMES = {
  category: { select: { id: true, name: true } },
  requester: PERSON,
} satisfies Prisma.RequestInclude;

export const WITH_HISTORY = {
  ...WITH_NAMES,
  history: {
    select: { fromStatus: true, toStatus: true, changedAt: true, changedBy: PERSON },
    orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.RequestInclude;

type RequestRow = Prisma.RequestGetPayload<{ include: typeof WITH_NAMES }>;
export type RequestDetailRow = Prisma.RequestGetPayload<{ include: typeof WITH_HISTORY }>;

export function toRequestDto(row: RequestRow): RequestDto {
  return {
    id: row.id,
    // O código não é coluna: sai do id a cada resposta.
    code: formatRequestCode(row.id),
    title: row.title,
    description: row.description,
    status: row.status,
    category: row.category,
    requester: row.requester,
    dueAt: row.dueAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toRequestDetail(row: RequestDetailRow): RequestDetail {
  return {
    ...toRequestDto(row),
    history: row.history.map((entry) => ({
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      changedBy: entry.changedBy,
      changedAt: entry.changedAt.toISOString(),
    })),
  };
}
