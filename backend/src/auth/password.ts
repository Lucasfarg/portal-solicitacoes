import * as argon2 from 'argon2';

// Argon2id com o mínimo da OWASP: 19 MiB, 2 iterações, 1 thread.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

// Falha do argon2 sobe como 500 em vez de parecer "senha errada".
export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
