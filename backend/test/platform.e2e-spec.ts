import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createCategory,
  createTestApp,
  createUser,
  resetDatabase,
  sessionCookieFor,
} from './helpers.js';

describe('Plataforma e banco (e2e)', () => {
  let app: NestExpressApplication;
  let ana: { id: number };

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ana = await createUser(app, 'ana');
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health responde sem sessão', async () => {
    const { body } = await http().get('/api/health').expect(200);

    expect(body).toEqual({ status: 'ok' });
  });

  it('os erros saem no mesmo formato (RFC 9457), em português', async () => {
    const response = await http().get('/api/nao-existe').expect(404);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ status: 404, detail: 'Rota não encontrada' });
  });

  it('GET /api/categories devolve só as ativas, em ordem alfabética', async () => {
    const { cookie } = await sessionCookieFor(app, ana.id);
    await createCategory(app, 'TI', 24);
    await createCategory(app, 'Compras', 120);
    await createCategory(app, 'Jurídico', 96, false);

    const { body } = await http().get('/api/categories').set('Cookie', cookie).expect(200);

    expect(body.map((category: { name: string }) => category.name)).toEqual(['Compras', 'TI']);
  });

  it('o banco recusa o que quebra as regras, mesmo gravando direto nele', async () => {
    const ti = await createCategory(app, 'TI', 24);
    const prisma = app.get(PrismaService);

    // SLA zero, categoria repetida com outra caixa e título curto demais.
    await expect(createCategory(app, 'RH', 0)).rejects.toThrow(/categories_sla_hours_check/);
    await expect(createCategory(app, 'ti', 24)).rejects.toThrow();
    await expect(
      prisma.request.create({
        data: {
          title: 'ab',
          description: 'Descrição',
          categoryId: ti.id,
          requesterId: ana.id,
          dueAt: new Date(Date.now() + 3_600_000),
        },
      }),
    ).rejects.toThrow(/requests_title_check/);
  });
});
