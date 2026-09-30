import { defineConfig } from 'prisma/config';

// O Prisma 7 não lê .env sozinho. Local: carrega o .env da raiz do repo.
// No Docker e no CI a variável já vem do ambiente e o arquivo não existe.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `prisma db seed` roda o seed já compilado (pnpm build antes).
    seed: 'node dist/seed.js',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
