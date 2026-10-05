import { IANAZone } from 'luxon';
import { z } from 'zod';

export const DEFAULT_TIMEZONE = 'America/Fortaleza';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  // O mínimo de 5 dá folga ao aviso da tela e à renovação de minuto em minuto.
  SESSION_IDLE_MINUTES: z.coerce
    .number()
    .int()
    .min(5, 'SESSION_IDLE_MINUTES precisa ser de pelo menos 5')
    .default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(8),
  APP_TIMEZONE: z
    .string()
    .refine(
      (value) => IANAZone.isValidZone(value),
      'Fuso horário IANA inválido (ex.: America/Fortaleza)',
    )
    .default(DEFAULT_TIMEZONE),
  TRUST_PROXY: z.string().trim().min(1).default('loopback'),
  // Pasta com o build do frontend. Preenchida só na imagem de hospedagem, em que a API
  // também entrega as telas; no compose quem faz isso é o nginx.
  WEB_ROOT: z.string().trim().min(1).optional(),
  // Ligar com HTTPS: cookie Secure com prefixo __Host- e navegador forçando HTTPS.
  HTTPS_ONLY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Num ambiente exposto, desligar: o Swagger entrega o mapa inteiro da API.
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  return envSchema.parse(raw);
}
