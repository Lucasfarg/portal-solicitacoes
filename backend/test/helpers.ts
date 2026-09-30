import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { CSRF_HEADER, CSRF_HEADER_VALUE, type UserRole } from '@portal/shared';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { SessionService } from '../src/auth/session.service.js';
import { SessionCookie } from '../src/auth/session-cookie.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const PASSWORD = 'Senha@123';

// Cabeçalho que a defesa CSRF exige em todo método que altera estado.
export const CSRF = { [CSRF_HEADER]: CSRF_HEADER_VALUE };

// A aplicação inteira, configurada como em produção, contra o PostgreSQL do Testcontainers.
export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

export async function resetDatabase(app: NestExpressApplication) {
  await app.get(PrismaService).$executeRaw`
    TRUNCATE users, sessions, categories, requests, request_status_history
    RESTART IDENTITY CASCADE`;
}

export async function createUser(
  app: NestExpressApplication,
  username: string,
  role: UserRole = 'REQUESTER',
) {
  return app.get(PrismaService).user.create({
    data: { name: username, username, role, passwordHash: await hashPassword(PASSWORD) },
  });
}

export async function createCategory(
  app: NestExpressApplication,
  name: string,
  slaHours: number,
  active = true,
) {
  return app.get(PrismaService).category.create({ data: { name, slaHours, active } });
}

// Cria a sessão direto no serviço e devolve o cabeçalho Cookie pronto,
// para os testes que não são sobre o login não gastarem o limite de tentativas.
export async function sessionCookieFor(app: NestExpressApplication, userId: number) {
  const token = await app.get(SessionService).create(userId);
  return { token, cookie: `${app.get(SessionCookie).name}=${token}` };
}
