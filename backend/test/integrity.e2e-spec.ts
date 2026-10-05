import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  CSRF,
  createCategory,
  createTestApp,
  createUser,
  resetDatabase,
  sessionCookieFor,
} from './helpers.js';

const HOUR = 3_600_000;

// Regras que o banco garante sozinho (CHECK, citext) e erros que não nascem no nosso código.
describe('Integridade do banco e erros da plataforma (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let ana: { id: number };
  let ti: { id: number };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ana = await createUser(app, 'ana');
    ti = await createCategory(app, 'TI', 24);
  });

  afterAll(async () => {
    await app.close();
  });

  const insertRequest = (data: { title?: string; createdAt?: Date; dueAt?: Date }) =>
    prisma.request.create({
      data: {
        title: data.title ?? 'Notebook não liga',
        description: 'Descrição',
        categoryId: ti.id,
        requesterId: ana.id,
        createdAt: data.createdAt ?? new Date(),
        dueAt: data.dueAt ?? new Date(Date.now() + HOUR),
      },
    });

  it('categoria: SLA precisa ser positivo e o nome não se repete com outra caixa', async () => {
    await expect(createCategory(app, 'RH', 0)).rejects.toThrow(/categories_sla_hours_check/);
    await expect(createCategory(app, 'ti', 24)).rejects.toThrow();
  });

  it('solicitação: título de 3 a 120 caracteres e prazo depois da abertura', async () => {
    await expect(insertRequest({ title: 'ab' })).rejects.toThrow(/requests_title_check/);
    const openedAt = new Date();
    await expect(insertRequest({ createdAt: openedAt, dueAt: openedAt })).rejects.toThrow(
      /requests_due_at_check/,
    );
  });

  it('solicitação: responsável só fora de Aberto, e exclusão só em Aberto', async () => {
    const { id } = await insertRequest({});
    const change = (data: Prisma.RequestUncheckedUpdateInput) =>
      prisma.request.update({ where: { id }, data });

    await expect(change({ status: 'IN_PROGRESS' })).rejects.toThrow(/requests_assignee_check/);
    await expect(change({ assigneeId: ana.id })).rejects.toThrow(/requests_assignee_check/);
    await expect(
      change({ status: 'IN_PROGRESS', assigneeId: ana.id, deletedAt: new Date() }),
    ).rejects.toThrow(/requests_deleted_at_check/);
  });

  it('histórico: só a abertura não tem origem, e toda linha muda o status', async () => {
    const { id } = await insertRequest({});
    const entry = (fromStatus: 'OPEN' | null, toStatus: 'OPEN' | 'IN_PROGRESS') =>
      prisma.requestStatusHistory.create({
        data: { requestId: id, fromStatus, toStatus, changedById: ana.id },
      });

    await expect(entry(null, 'IN_PROGRESS')).rejects.toThrow(
      /request_status_history_opening_check/,
    );
    await expect(entry('OPEN', 'OPEN')).rejects.toThrow(/request_status_history_change_check/);
    await expect(entry(null, 'OPEN')).resolves.toBeDefined();
  });

  it('lista e detalhe dizem se está fora do prazo, pelo relógio da API', async () => {
    const { cookie } = await sessionCookieFor(app, ana.id);
    const late = await insertRequest({
      title: 'Vencida',
      createdAt: new Date(Date.now() - 2 * HOUR),
      dueAt: new Date(Date.now() - HOUR),
    });
    await insertRequest({ title: 'No prazo' });

    const list = await request(app.getHttpServer()).get('/api/requests').set('Cookie', cookie);
    const overdue = Object.fromEntries(
      list.body.items.map((item: { title: string; overdue: boolean }) => [
        item.title,
        item.overdue,
      ]),
    );
    expect(overdue).toEqual({ Vencida: true, 'No prazo': false });

    const detail = await request(app.getHttpServer())
      .get(`/api/requests/${late.id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(detail.body.overdue).toBe(true);
  });

  it('rota inexistente e JSON malformado respondem em português, no mesmo formato', async () => {
    const { cookie } = await sessionCookieFor(app, ana.id);

    const missing = await request(app.getHttpServer())
      .get('/api/nao-existe')
      .set('Cookie', cookie)
      .expect(404);
    expect(missing.body).toMatchObject({ status: 404, detail: 'Rota não encontrada' });

    const malformed = await request(app.getHttpServer())
      .post('/api/requests')
      .set(CSRF)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"title": ')
      .expect(400);
    expect(malformed.body).toMatchObject({
      status: 400,
      detail: 'Requisição malformada: o corpo não é um JSON válido ou a URL está mal codificada',
    });
  });
});
