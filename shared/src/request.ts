import { z } from 'zod';
import { requestStatusSchema } from './request-status.js';

// Maior valor de uma coluna INTEGER do PostgreSQL: um id acima disso não existe.
const MAX_ID = 2_147_483_647;

// Ids chegam como texto (rota e query string); o schema converte e valida.
export const idSchema = z.coerce
  .number('Identificador inválido')
  .int('Identificador inválido')
  .min(1, 'Identificador inválido')
  .max(MAX_ID, 'Identificador inválido');

// ---------- Entrada ----------

export const createRequestSchema = z.object({
  title: z
    .string('Informe o título')
    .trim()
    .min(3, 'O título precisa de pelo menos 3 caracteres')
    .max(120, 'O título aceita até 120 caracteres'),
  description: z
    .string('Informe a descrição')
    .trim()
    .min(1, 'Informe a descrição')
    .max(2000, 'A descrição aceita até 2000 caracteres'),
  categoryId: z
    .number('Informe a categoria')
    .int('Categoria inválida')
    .min(1, 'Categoria inválida')
    .max(MAX_ID, 'Categoria inválida'),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

// Edição parcial: os mesmos campos e regras da criação, todos opcionais.
export const updateRequestSchema = createRequestSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Informe ao menos um campo para alterar');

export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;

export const changeStatusSchema = z.object({
  status: requestStatusSchema,
});

export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

const dateOnlySchema = z.iso.date('Use uma data no formato AAAA-MM-DD');

// Filtros e paginação da listagem. Tudo chega como texto na query string.
export const listRequestsQuerySchema = z
  .object({
    status: requestStatusSchema.optional(),
    categoryId: idSchema.optional(),
    // Período de abertura, em datas do horário de Fortaleza; as duas pontas entram no resultado.
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    // Texto procurado no título.
    q: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ['to'],
    message: 'A data final não pode ser anterior à inicial',
  });

export type ListRequestsQuery = z.infer<typeof listRequestsQuerySchema>;

// ---------- Saída ----------

const personSchema = z.object({ id: z.number().int(), name: z.string() });

export const requestSchema = z.object({
  id: z.number().int(),
  // Código de exibição (SOL-000123), derivado do id.
  code: z.string(),
  title: z.string(),
  description: z.string(),
  status: requestStatusSchema,
  category: z.object({ id: z.number().int(), name: z.string() }),
  requester: personSchema,
  // Prazo de atendimento, calculado na abertura.
  dueAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type RequestDto = z.infer<typeof requestSchema>;

export const statusHistoryEntrySchema = z.object({
  // Nulo no registro de abertura.
  fromStatus: requestStatusSchema.nullable(),
  toStatus: requestStatusSchema,
  changedBy: personSchema,
  changedAt: z.iso.datetime(),
});

export type StatusHistoryEntry = z.infer<typeof statusHistoryEntrySchema>;

export const requestDetailSchema = requestSchema.extend({
  history: z.array(statusHistoryEntrySchema),
});

export type RequestDetail = z.infer<typeof requestDetailSchema>;

export const requestPageSchema = z.object({
  items: z.array(requestSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  // Total de solicitações que atendem aos filtros, somando todas as páginas.
  total: z.number().int(),
});

export type RequestPage = z.infer<typeof requestPageSchema>;

export function formatRequestCode(id: number): string {
  return `SOL-${String(id).padStart(6, '0')}`;
}
