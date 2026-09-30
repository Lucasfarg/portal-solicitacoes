import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from './auth/password.js';
import { PrismaClient } from './generated/prisma/client.js';

// Dados de demonstração. Idempotente: roda a cada subida do container sem duplicar
// nem sobrescrever o que já existe (upsert sem alteração).

// Local: usa o .env da raiz do repo. No Docker a variável já vem do ambiente.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {}

const DEMO_PASSWORD = 'Senha@123';

const CATEGORIES = [
  { name: 'TI', slaHours: 24 },
  { name: 'Infraestrutura', slaHours: 48 },
  { name: 'RH', slaHours: 72 },
  { name: 'Financeiro', slaHours: 72 },
  { name: 'Compras', slaHours: 120 },
];

const USERS = [
  { name: 'Ana Souza', username: 'ana', role: 'REQUESTER' },
  { name: 'Bruno Lima', username: 'bruno', role: 'REQUESTER' },
  { name: 'Carla Mendes', username: 'carla', role: 'AGENT' },
] as const;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

try {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: category.name },
      create: category,
      update: {},
    });
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { username: user.username },
      create: { ...user, passwordHash },
      update: {},
    });
  }

  console.log(`Seed aplicado: ${CATEGORIES.length} categorias, ${USERS.length} usuários.`);
} finally {
  await prisma.$disconnect();
}
