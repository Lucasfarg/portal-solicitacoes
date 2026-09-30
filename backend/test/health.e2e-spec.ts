import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, resetDatabase } from './helpers.js';

describe('Fundação da API (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health responde ok sem sessão, com os cabeçalhos do Helmet', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('enxerga as tabelas criadas pelas migrações', async () => {
    await expect(app.get(PrismaService).category.count()).resolves.toBe(0);
  });

  it('rota inexistente devolve 404 no formato RFC 9457', async () => {
    const response = await request(app.getHttpServer()).get('/api/nao-existe').expect(404);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      instance: '/api/nao-existe',
    });
  });

  it('publica o OpenAPI com o corpo do login gerado do schema Zod', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    const login = response.body.paths['/api/auth/login'].post;
    expect(JSON.stringify(login.requestBody)).toContain('username');
  });
});
