import { z } from 'zod';

// Defesa contra CSRF: um formulário em outro site não consegue enviar este cabeçalho.
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'XMLHttpRequest';

export const SESSION_IDLE_HEADER = 'X-Session-Idle-Minutes';

// Contado pelo servidor: a API só renova o uso da sessão de minuto em minuto.
export const SESSION_REMAINING_HEADER = 'X-Session-Remaining-Seconds';

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
