import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  // Sessão expira por inatividade ou pelo limite absoluto, o que vier primeiro.
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(8),
  // Ligar quando o portal é servido por HTTPS: cookie de sessão com Secure e prefixo
  // __Host-, e o navegador passa a forçar HTTPS em todo recurso.
  HTTPS_ONLY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

// Falha na subida, com a lista de variáveis erradas, em vez de quebrar na primeira consulta.
export function validateEnv(raw: Record<string, unknown>): Env {
  return envSchema.parse(raw);
}
