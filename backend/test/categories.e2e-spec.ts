import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  createCategory,
  createTestApp,
  createUser,
  resetDatabase,
  sessionCookieFor,
} from './helpers.js';

describe('Categorias (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/categories devolve só as ativas, em ordem alfabética', async () => {
    const ana = await createUser(app, 'ana');
    const { cookie } = await sessionCookieFor(app, ana.id);
    const ti = await createCategory(app, 'TI', 24);
    const compras = await createCategory(app, 'Compras', 120);
    await createCategory(app, 'Jurídico', 96, false);

    const response = await request(app.getHttpServer())
      .get('/api/categories')
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body).toEqual([
      { id: compras.id, name: 'Compras', slaHours: 120 },
      { id: ti.id, name: 'TI', slaHours: 24 },
    ]);
  });

  it('exige sessão', async () => {
    await request(app.getHttpServer()).get('/api/categories').expect(401);
  });
});
