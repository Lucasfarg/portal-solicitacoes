import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
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

  const http = () => request(app.getHttpServer());
  const login = (username: string, password: string) =>
    http().post('/api/auth/login').set(CSRF).send({ username, password });
  const me = (cookie: string) => http().get('/api/auth/me').set('Cookie', cookie);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ana = await createUser(app, 'ana');
    await createUser(app, 'bruno');
  });

  afterAll(async () => {
    await app.close();
  });

  it('login devolve o usuário e um cookie de sessão HttpOnly', async () => {
    const response = await login('ana', PASSWORD).expect(200);

    expect(response.body).toEqual({ id: ana.id, name: 'ana', username: 'ana', role: 'REQUESTER' });
    const [cookie] = response.get('Set-Cookie') ?? [];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('senha errada e usuário inexistente recebem a mesma resposta', async () => {
    const wrongPassword = await login('ana', 'errada').expect(401);
    const unknownUser = await login('ninguem', PASSWORD).expect(401);

    expect(wrongPassword.body.detail).toBe('Usuário ou senha inválidos');
    expect(unknownUser.body.detail).toBe(wrongPassword.body.detail);
  });

  it('usuário desativado não entra', async () => {
    await prisma.user.update({ where: { id: ana.id }, data: { active: false } });

    await login('ana', PASSWORD).expect(401);
  });

  it('sem o cabeçalho X-Requested-With o login é recusado (defesa CSRF)', async () => {
    await http().post('/api/auth/login').send({ username: 'ana', password: PASSWORD }).expect(403);
  });

  it('/auth/me devolve o usuário da sessão e responde 401 sem cookie', async () => {
    const { cookie } = await sessionCookieFor(app, ana.id);

    expect((await me(cookie).expect(200)).body.username).toBe('ana');
    await http().get('/api/auth/me').expect(401);
  });

  it('a sessão expira depois de 30 minutos sem uso', async () => {
    const { cookie } = await sessionCookieFor(app, ana.id);
    await prisma.session.updateMany({ data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) } });

    await me(cookie).expect(401);
    await expect(prisma.session.count()).resolves.toBe(0);
  });

  it('logout encerra a sessão no servidor: o mesmo cookie deixa de valer', async () => {
    const { cookie } = await sessionCookieFor(app, ana.id);

    await http().post('/api/auth/logout').set(CSRF).set('Cookie', cookie).expect(204);

    await me(cookie).expect(401);
  });

  it('5 senhas erradas seguidas bloqueiam o usuário por um minuto, mas não os outros', async () => {
    for (let i = 0; i < 5; i++) {
      await login('ana', 'errada').expect(401);
    }

    await login('ana', PASSWORD).expect(429);
    await login('bruno', PASSWORD).expect(200);
  });

  it('um login certo zera a contagem de erros', async () => {
    for (let i = 0; i < 4; i++) {
      await login('ana', 'errada').expect(401);
    }
    await login('ana', PASSWORD).expect(200);

    await login('ana', 'errada').expect(401);
    await login('ana', PASSWORD).expect(200);
  });
});
