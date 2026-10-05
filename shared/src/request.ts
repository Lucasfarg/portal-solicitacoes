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

// Limites de tamanho: a API, o formulário (contador e maxlength) e o Swagger leem daqui. O
// CHECK do banco repete os mesmos números na migração.
export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;

// O banco (char_length) conta caracteres; o JavaScript (length) conta unidades UTF-16, e um
// emoji vale 2. O mínimo é conferido em caracteres, como no banco: "😀😀" tem 2, não 4.
// O máximo pelo length já é mais estrito que o do banco.
const characters = (value: string) => [...value].length;

export const createRequestSchema = z.object({
  title: z
    .string('Informe o título')
    .trim()
    // abort: sem o mínimo pelo length, a conferência por caracteres abaixo nem roda (uma
    // mensagem só para o campo).
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
    // Período de abertura, em datas do fuso da API (APP_TIMEZONE); as duas pontas entram.
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    // Texto procurado no título.
    q: z.string().trim().max(TITLE_MAX).optional(),
    // Só as fora do prazo: não concluídas e com o prazo vencido (a mesma regra do painel).
    overdue: z
      .literal('true', 'Use overdue=true')
      .transform(() => true as const)
      .optional(),
    // Instante da primeira página: a lista só considera as abertas até ele, para que
    // solicitações novas não empurrem itens entre as páginas enquanto a pessoa navega. Sem
    // ele, a API usa o instante dela e o devolve na resposta (RequestPage.asOf).
    asOf: z.iso
      .datetime('Use data e hora ISO 8601 em UTC (ex.: 2026-10-05T12:00:00.000Z)')
      .optional(),
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

// Uma linha da lista: tudo menos a descrição, que só o detalhe mostra.
export const requestSummarySchema = z.object({
  id: z.number().int(),
  // Código de exibição (SOL-000123), derivado do id.
  code: z.string(),
  title: z.string(),
  status: requestStatusSchema,
  category: z.object({ id: z.number().int(), name: z.string() }),
  requester: personSchema,
  // Atendente que iniciou o atendimento; nulo enquanto está em Aberto.
  assignee: personSchema.nullable(),
  // Prazo de atendimento, calculado na abertura em horas úteis.
  dueAt: z.iso.datetime(),
  // Não concluída e com o prazo vencido, pelo relógio da API: a tela não decide com o relógio
  // do navegador, e o painel e o filtro usam o mesmo critério.
  overdue: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type RequestSummary = z.infer<typeof requestSummarySchema>;

export const statusHistoryEntrySchema = z.object({
  // Nulo no registro de abertura.
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
  // Total de solicitações que atendem aos filtros, somando todas as páginas.
  total: z.number().int(),
  // Instante que fixou a lista: o asOf pedido ou, sem ele, o relógio da API. A tela guarda
  // na URL para as próximas páginas.
  asOf: z.iso.datetime(),
});

export type RequestPage = z.infer<typeof requestPageSchema>;

// Situação de acesso de uma solicitação da resposta, no formato das regras (request-rules.ts).
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
