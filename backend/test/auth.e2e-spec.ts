import type { NestExpressApplication } from '@nestjs/platform-express';
import { SESSION_IDLE_HEADER, SESSION_REMAINING_HEADER } from '@portal/shared';
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

    it('não diferencia maiúsculas no usuário, nem no que foi gravado direto no banco', async () => {
      await prisma.user.update({ where: { id: ana.id }, data: { username: 'Ana' } });

      await login({ username: 'ANA', password: PASSWORD }).expect(200);
      await expect(
        prisma.user.create({ data: { name: 'Outra', username: 'ana', passwordHash: 'x' } }),
      ).rejects.toThrow();
    });

    it('usuário desativado não entra (mesma resposta de senha errada) e perde as sessões', async () => {
      const { cookie } = await sessionCookieFor(app, ana.id);
      await prisma.user.update({ where: { id: ana.id }, data: { active: false } });

      const response = await login({ username: 'ana', password: PASSWORD }).expect(401);
      expect(response.body.detail).toBe('Usuário ou senha inválidos');
      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
      await expect(prisma.session.count()).resolves.toBe(0);
    });

    it('entrar de novo no mesmo navegador encerra a sessão anterior', async () => {
      const { cookie } = await sessionCookieFor(app, ana.id);

      await login({ username: 'ana', password: PASSWORD }).set('Cookie', cookie).expect(200);

      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
      await expect(prisma.session.count()).resolves.toBe(1);
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
      // O tempo de inatividade da sessão e o que falta dele vão junto, para o aviso da tela
      // seguir a API.
      expect(response.get(SESSION_IDLE_HEADER)).toBe('30');
      expect(Number(response.get(SESSION_REMAINING_HEADER))).toBeGreaterThan(29 * 60);
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
      // A sessão precisa ter começado antes do limite (CHECK expires_at > created_at).
      await prisma.session.updateMany({
        data: {
          createdAt: new Date(Date.now() - 9 * 3_600_000),
          expiresAt: new Date(Date.now() - 1_000),
        },
      });

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

    it('com a sessão já vencida também sai: 204 e o cookie limpo', async () => {
      const { cookie } = await sessionCookieFor(app, ana.id);
      await prisma.session.updateMany({
        data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) },
      });

      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set(CSRF)
        .set('Cookie', cookie)
        .expect(204);

      expect(response.get('Set-Cookie')?.[0]).toMatch(/^sid=;/);
      await expect(prisma.session.count()).resolves.toBe(0);
    });

    it('sem cookie responde 204, e sem o cabeçalho CSRF, 403', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').set(CSRF).expect(204);
      await request(app.getHttpServer()).post('/api/auth/logout').expect(403);
    });
  });
});

describe('Limite de tentativas de login (e2e)', () => {
  let app: NestExpressApplication;

  const attempt = (password: string, username = 'ana') =>
    request(app.getHttpServer()).post('/api/auth/login').set(CSRF).send({ username, password });

  // Os erros ficam na tabela login_failures, que o resetDatabase limpa a cada teste.
  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    await createUser(app, 'ana');
    await createUser(app, 'bruno');
  });

  afterAll(async () => {
    await app.close();
  });

  it('bloqueia com 429 depois de 5 erros seguidos no mesmo usuário, mesmo com a senha certa', async () => {
    for (let i = 0; i < 5; i++) {
      await attempt('errada').expect(401);
    }
    const response = await attempt(PASSWORD).expect(429);

    expect(response.body).toMatchObject({
      title: 'Too Many Requests',
      status: 429,
      detail: 'Muitas tentativas de login. Aguarde um minuto e tente de novo.',
    });
    // O bloqueio é do usuário que errou: outro usuário do mesmo IP entra.
    await attempt(PASSWORD, 'bruno').expect(200);
  });

  it('tentativas simultâneas não furam o limite: no máximo 5 chegam a conferir a senha', async () => {
    const responses = await Promise.all(Array.from({ length: 12 }, () => attempt('errada')));
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 401).length).toBeLessThanOrEqual(5);
    expect(statuses.every((status) => status === 401 || status === 429)).toBe(true);
  });

  it('login certo não conta: um escritório inteiro saindo pelo mesmo IP não se bloqueia', async () => {
    for (let i = 0; i < 8; i++) {
      await attempt(PASSWORD).expect(200);
    }
  });

  it('a contagem fica no banco: outra instância da API também bloqueia', async () => {
    for (let i = 0; i < 5; i++) {
      await attempt('errada').expect(401);
    }
    await expect(app.get(PrismaService).loginFailure.count()).resolves.toBe(5);

    const otherInstance = await createTestApp();
    try {
      await request(otherInstance.getHttpServer())
        .post('/api/auth/login')
        .set(CSRF)
        .send({ username: 'ana', password: PASSWORD })
        .expect(429);
    } finally {
      await otherInstance.close();
    }
  });

  it('um login certo zera os erros daquele usuário', async () => {
    for (let i = 0; i < 4; i++) {
      await attempt('errada').expect(401);
    }
    await attempt(PASSWORD).expect(200);
    await expect(app.get(PrismaService).loginFailure.count()).resolves.toBe(0);
    for (let i = 0; i < 4; i++) {
      await attempt('errada').expect(401);
    }
  });
});
