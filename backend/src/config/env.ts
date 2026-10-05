import { z } from 'zod';

export const DEFAULT_TIMEZONE = 'America/Fortaleza';

// Fuso IANA aceito pelo Intl (o mesmo que faz as contas de data em request-rules.ts).
function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  // Sessão expira por inatividade ou pelo limite absoluto, o que vier primeiro. O mínimo de 5
  // dá folga ao aviso da tela, que sai antes do fim, e à renovação de minuto em minuto.
  SESSION_IDLE_MINUTES: z.coerce
    .number()
    .int()
    .min(5, 'SESSION_IDLE_MINUTES precisa ser de pelo menos 5')
    .default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(8),
  // Fuso do expediente e das datas do filtro: decide onde começa cada dia e o horário útil.
  APP_TIMEZONE: z
    .string()
    .refine(isTimeZone, 'Fuso horário IANA inválido (ex.: America/Fortaleza)')
    .default(DEFAULT_TIMEZONE),
  // De onde a API aceita o X-Forwarded-For (sintaxe do "trust proxy" do Express): "loopback",
  // "uniquelocal", IPs ou faixas separados por vírgula.
  TRUST_PROXY: z.string().trim().min(1).default('loopback'),
  // Ligar quando o portal é servido por HTTPS: cookie de sessão com Secure e prefixo
  // __Host-, e o navegador passa a forçar HTTPS em todo recurso.
  HTTPS_ONLY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Documentação interativa em /api/docs. Ligada por padrão, para quem avalia a API pelo
  // compose; num ambiente exposto, desligar: ela entrega o mapa inteiro da API.
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

// Falha na subida, com a lista de variáveis erradas, em vez de quebrar na primeira consulta.
export function validateEnv(raw: Record<string, unknown>): Env {
  return envSchema.parse(raw);
}
