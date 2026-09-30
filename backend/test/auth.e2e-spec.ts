import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { hashToken } from '../src/auth/session.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  CSRF,
  createTestApp,
  createUser,
  PASSWORD,
  resetDatabase,
  sessionCookieFor,
} from './helpers.js';

describe('Autenticação (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let ana: { id: number };

  const login = (body: object) =>
    request(app.getHttpServer()).post('/api/auth/login').set(CSRF).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ana = await createUser(app, 'ana');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('abre a sessão: devolve o usuário e um cookie HttpOnly e SameSite=Strict', async () => {
      const response = await login({ username: 'ana', password: PASSWORD }).expect(200);

      expect(response.body).toEqual({
        id: ana.id,
        name: 'ana',
        username: 'ana',
        role: 'REQUESTER',
      });
      const [cookie] = response.get('Set-Cookie') ?? [];
      expect(cookie).toMatch(/^sid=[\w-]{43};/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
    });

    it('guarda no banco só o SHA-256 do token', async () => {
      const response = await login({ username: 'ana', password: PASSWORD }).expect(200);
      const token = /^sid=([\w-]+);/.exec(response.get('Set-Cookie')?.[0] ?? '')?.[1] ?? '';

      const [session] = await prisma.session.findMany();
      expect(session.tokenHash).toBe(hashToken(token));
      expect(session.tokenHash).not.toContain(token);
    });

    it('responde o mesmo 401 para senha errada e para usuário inexistente', async () => {
      const wrongPassword = await login({ username: 'ana', password: 'errada' }).expect(401);
      const unknownUser = await login({ username: 'ninguem', password: PASSWORD }).expect(401);

      expect(wrongPassword.headers['content-type']).toContain('application/problem+json');
      expect(wrongPassword.body.detail).toBe('Usuário ou senha inválidos');
      expect(unknownUser.body.detail).toBe(wrongPassword.body.detail);
      await expect(prisma.session.count()).resolves.toBe(0);
    });

    it('responde 400 com a lista de campos quando o corpo é inválido', async () => {
      const response = await login({ username: '' }).expect(400);

      expect(response.body).toMatchObject({ title: 'Bad Request', detail: 'Dados inválidos' });
      expect(response.body.errors.map((e: { path: string }) => e.path)).toEqual([
        'username',
        'password',
      ]);
    });

    it('responde 403 sem o cabeçalho X-Requested-With (defesa CSRF)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'ana', password: PASSWORD })
        .expect(403);

      await expect(prisma.session.count()).resolves.toBe(0);
    });
  });

  describe('GET /api/auth/me', () => {
    it('responde 401 sem cookie', async () => {
      const response = await request(app.getHttpServer()).get('/api/auth/me').expect(401);

      expect(response.body.detail).toBe('Sessão inexistente ou expirada');
    });

    it('responde 401 para um token que não existe', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', 'sid=token-inventado')
        .expect(401);
    });

    it('devolve o usuário da sessão', async () => {
      const { cookie } = await sessionCookieFor(app, ana.id);

      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body).toEqual({
        id: ana.id,
        name: 'ana',
        username: 'ana',
        role: 'REQUESTER',
      });
    });

    it('expira a sessão após 30 min sem uso e a apaga do banco', async () => {
      const { cookie } = await sessionCookieFor(app, ana.id);
      await prisma.session.updateMany({
        data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) },
      });

      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
      await expect(prisma.session.count()).resolves.toBe(0);
    });

    it('expira a sessão no limite absoluto, mesmo em uso', async () => {
      const { cookie } = await sessionCookieFor(app, ana.id);
      await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1_000) } });

      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('invalida a sessão no servidor: o mesmo cookie deixa de valer', async () => {
      const { cookie } = await sessionCookieFor(app, ana.id);

      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set(CSRF)
        .set('Cookie', cookie)
        .expect(204);

      expect(response.get('Set-Cookie')?.[0]).toMatch(/^sid=;/);
      await expect(prisma.session.count()).resolves.toBe(0);
      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    });

    it('responde 401 sem sessão', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').set(CSRF).expect(401);
    });
  });
});

describe('Limite de tentativas de login (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    await createUser(app, 'ana');
  });

  afterAll(async () => {
    await app.close();
  });

  it('bloqueia com 429 a sexta tentativa em um minuto, mesmo com a senha certa', async () => {
    const attempt = (password: string) =>
      request(app.getHttpServer())
        .post('/api/auth/login')
        .set(CSRF)
        .send({ username: 'ana', password });

    for (let i = 0; i < 5; i++) {
      await attempt('errada').expect(401);
    }
    const response = await attempt(PASSWORD).expect(429);

    expect(response.body).toMatchObject({
      title: 'Too Many Requests',
      status: 429,
      detail: 'Muitas tentativas de login. Aguarde um minuto e tente de novo.',
    });
  });
});
