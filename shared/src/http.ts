import { z } from 'zod';

// Defesa contra CSRF: a API só aceita métodos que alteram estado com este cabeçalho.
// Um formulário ou link em outro site não consegue enviá-lo; o front envia em toda chamada.
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'XMLHttpRequest';

// Minutos sem uso até a sessão expirar, enviados em toda resposta autenticada: o aviso de
// sessão na tela segue a configuração da API em vez de uma constante própria.
export const SESSION_IDLE_HEADER = 'X-Session-Idle-Minutes';

// Segundos que faltam para a sessão expirar, contados pelo servidor. A tela conta a partir
// deles (e não do tempo cheio): a API só renova o uso da sessão de minuto em minuto.
export const SESSION_REMAINING_HEADER = 'X-Session-Remaining-Seconds';

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
