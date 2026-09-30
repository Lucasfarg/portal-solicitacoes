import { z } from 'zod';

// Defesa contra CSRF: a API só aceita métodos que alteram estado com este cabeçalho.
// Um formulário ou link em outro site não consegue enviá-lo; o front envia em toda chamada.
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'XMLHttpRequest';

// Formato único de erro da API (RFC 9457, application/problem+json).
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
  // Presente nos erros de validação (400): um item por campo inválido.
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
