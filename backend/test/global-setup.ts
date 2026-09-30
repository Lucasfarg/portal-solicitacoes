import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer;

// Um PostgreSQL 18 descartável por execução, com as migrações reais aplicadas:
// os testes e2e rodam contra o mesmo banco e o mesmo SQL da entrega.
export async function setup() {
  container = await new PostgreSqlContainer('postgres:18').start();
  process.env.DATABASE_URL = container.getConnectionUri();

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: process.env,
    stdio: 'inherit',
  });
}

export async function teardown() {
  await container.stop();
}
