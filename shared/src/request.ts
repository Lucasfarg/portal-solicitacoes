import { z } from 'zod';
import { requestStatusSchema } from './request-status.js';

const MAX_ID = 2_147_483_647;

export const idSchema = z.coerce
  .number('Identificador inválido')
  .int('Identificador inválido')
  .min(1, 'Identificador inválido')
  .max(MAX_ID, 'Identificador inválido');

// O CHECK do banco repete estes números na migração.
export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;

// O banco conta caracteres e o length conta UTF-16 (emoji vale 2): o mínimo vai em caracteres.
const characters = (value: string) => [...value].length;

export const createRequestSchema = z.object({
  title: z
    .string('Informe o título')
    .trim()
    // abort: sem o mínimo pelo length, a conferência por caracteres nem roda.
    .min(TITLE_MIN, {
      message: `O título precisa de pelo menos ${TITLE_MIN} caracteres`,
      abort: true,
    })
    .max(TITLE_MAX, `O título aceita até ${TITLE_MAX} caracteres`)
    .refine(
      (title) => characters(title) >= TITLE_MIN,
      `O título precisa de pelo menos ${TITLE_MIN} caracteres`,
    ),
  description: z
    .string('Informe a descrição')
    .trim()
    .min(1, 'Informe a descrição')
    .max(DESCRIPTION_MAX, `A descrição aceita até ${DESCRIPTION_MAX} caracteres`),
  categoryId: z
    .number('Informe a categoria')
    .int('Categoria inválida')
    .min(1, 'Categoria inválida')
    .max(MAX_ID, 'Categoria inválida'),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const updateRequestSchema = createRequestSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Informe ao menos um campo para alterar');

export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;

export const changeStatusSchema = z.object({
  status: requestStatusSchema,
});

export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

const dateOnlySchema = z.iso.date('Use uma data no formato AAAA-MM-DD');

export const listRequestsQuerySchema = z
  .object({
    status: requestStatusSchema.optional(),
    categoryId: idSchema.optional(),
    // Datas no fuso da API (APP_TIMEZONE); as duas pontas entram.
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    q: z.string().trim().max(TITLE_MAX).optional(),
    overdue: z
      .literal('true', 'Use overdue=true')
      .transform(() => true as const)
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ['to'],
    message: 'A data final não pode ser anterior à inicial',
  });

export type ListRequestsQuery = z.infer<typeof listRequestsQuerySchema>;

const personSchema = z.object({ id: z.number().int(), name: z.string() });

export const requestSummarySchema = z.object({
  id: z.number().int(),
  code: z.string(),
  title: z.string(),
  status: requestStatusSchema,
  category: z.object({ id: z.number().int(), name: z.string() }),
  requester: personSchema,
  assignee: personSchema.nullable(),
  dueAt: z.iso.datetime(),
  // Pelo relógio da API, não do navegador; painel e filtro usam o mesmo critério.
  overdue: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type RequestSummary = z.infer<typeof requestSummarySchema>;

export const statusHistoryEntrySchema = z.object({
  fromStatus: requestStatusSchema.nullable(),
  toStatus: requestStatusSchema,
  changedBy: personSchema,
  changedAt: z.iso.datetime(),
});

export const requestDetailSchema = requestSummarySchema.extend({
  description: z.string(),
  history: z.array(statusHistoryEntrySchema),
});

export type RequestDetail = z.infer<typeof requestDetailSchema>;

export const requestPageSchema = z.object({
  items: z.array(requestSummarySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export type RequestPage = z.infer<typeof requestPageSchema>;

export function accessOf(request: RequestSummary) {
  return {
    requesterId: request.requester.id,
    status: request.status,
    assigneeId: request.assignee?.id ?? null,
  };
}

export function formatRequestCode(id: number): string {
  return `SOL-${String(id).padStart(6, '0')}`;
}
