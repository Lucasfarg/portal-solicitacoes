import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { Env } from '../src/config/env.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { dueDate } from '../src/requests/request-rules.js';
import {
  CSRF,
  createCategory,
  createTestApp,
  createUser,
  resetDatabase,
  sessionCookieFor,
} from './helpers.js';

describe('Solicitações (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let ana: string;
  let bruno: string;
  let carla: string;
  let ti: { id: number };
  let compras: { id: number };
  let inactive: { id: number };
  let timeZone: string;

  const http = () => request(app.getHttpServer());

  const cookieOf = async (username: string, role?: 'AGENT') =>
    (await sessionCookieFor(app, (await createUser(app, username, role)).id)).cookie;

  const expectedDue = (createdAt: string, slaHours: number) =>
    dueDate(new Date(createdAt), slaHours, timeZone).toISOString();

  const open = (cookie: string, body: object = {}) =>
    http()
      .post('/api/requests')
      .set(CSRF)
      .set('Cookie', cookie)
      .send({
        title: 'Notebook não liga',
        description: 'Parou de ligar ontem à tarde.',
        categoryId: ti.id,
        ...body,
      });

  const openId = async (cookie: string, body: object = {}): Promise<number> =>
    (await open(cookie, body).expect(201)).body.id;

  const list = (cookie: string, query: object = {}) =>
    http().get('/api/requests').query(query).set('Cookie', cookie);

  const detail = (cookie: string, id: number | string) =>
    http().get(`/api/requests/${id}`).set('Cookie', cookie);

  const edit = (cookie: string, id: number, body: object) =>
    http().patch(`/api/requests/${id}`).set(CSRF).set('Cookie', cookie).send(body);

  const remove = (cookie: string, id: number) =>
    http().delete(`/api/requests/${id}`).set(CSRF).set('Cookie', cookie);

  const setStatus = (cookie: string, id: number, status: string) =>
    http().patch(`/api/requests/${id}/status`).set(CSRF).set('Cookie', cookie).send({ status });

  const titles = (response: request.Response) =>
    response.body.items.map((item: { title: string }) => item.title);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    timeZone = config.get('APP_TIMEZONE', { infer: true });
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ana = await cookieOf('ana');
    bruno = await cookieOf('bruno');
    carla = await cookieOf('carla', 'AGENT');
    ti = await createCategory(app, 'TI', 24);
    compras = await createCategory(app, 'Compras', 120);
    inactive = await createCategory(app, 'Jurídico', 96, false);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('abrir', () => {
    it('nasce em Aberto, sem responsável, com o prazo da categoria e o registro de abertura', async () => {
      const { body } = await open(ana).expect(201);

      expect(body).toMatchObject({
        code: 'SOL-000001',
        status: 'OPEN',
        category: { name: 'TI' },
        requester: { name: 'ana' },
        assignee: null,
      });
      expect(body.dueAt).toBe(expectedDue(body.createdAt, 24));
      expect(body.history).toHaveLength(1);
    });

    it('responde 400 dizendo quais campos estão inválidos', async () => {
      const { body } = await open(ana, { title: 'ab', description: '  ', categoryId: 'x' }).expect(
        400,
      );

      expect(body.errors.map((error: { path: string }) => error.path)).toEqual([
        'title',
        'description',
        'categoryId',
      ]);
    });

    it('não aceita categoria desativada', async () => {
      const { body } = await open(ana, { categoryId: inactive.id }).expect(400);

      expect(body.errors[0].message).toBe('Categoria inexistente ou inativa');
    });

    it('exige sessão', async () => {
      await http().post('/api/requests').set(CSRF).send({}).expect(401);
    });
  });

  describe('listar', () => {
    it('colaborador vê só as próprias; atendente vê todas, da mais nova para a mais antiga', async () => {
      await openId(ana, { title: 'Da Ana' });
      await openId(bruno, { title: 'Do Bruno' });

      expect(titles(await list(ana).expect(200))).toEqual(['Da Ana']);
      expect(titles(await list(carla).expect(200))).toEqual(['Do Bruno', 'Da Ana']);
    });

    it('filtra por status, categoria e texto no título', async () => {
      const printer = await openId(ana, { title: 'Impressora sem toner' });
      await openId(ana, { title: 'Comprar cadeiras', categoryId: compras.id });
      await setStatus(carla, printer, 'IN_PROGRESS').expect(200);

      expect(titles(await list(ana, { status: 'IN_PROGRESS' }).expect(200))).toEqual([
        'Impressora sem toner',
      ]);
      expect(titles(await list(ana, { categoryId: compras.id }).expect(200))).toEqual([
        'Comprar cadeiras',
      ]);
      expect(titles(await list(ana, { q: 'IMPRESSORA' }).expect(200))).toEqual([
        'Impressora sem toner',
      ]);
    });

    it('filtra pelo período de abertura, com os dois dias inclusos', async () => {
      for (const day of ['2026-09-30', '2026-10-01', '2026-10-02']) {
        const id = await openId(ana, { title: day });
        const createdAt = new Date(`${day}T15:00:00Z`);
        const dueAt = new Date(createdAt.getTime() + 3_600_000);
        await prisma.request.update({ where: { id }, data: { createdAt, dueAt } });
      }

      const period = await list(ana, { from: '2026-10-01', to: '2026-10-02' }).expect(200);

      expect(titles(period)).toEqual(['2026-10-02', '2026-10-01']);
    });

    it('filtra as fora do prazo, sem contar as concluídas', async () => {
      const late = await openId(ana, { title: 'Vencida' });
      const lateDone = await openId(ana, { title: 'Vencida e concluída' });
      await openId(ana, { title: 'No prazo' });
      const createdAt = new Date(Date.now() - 48 * 3_600_000);
      const dueAt = new Date(Date.now() - 3_600_000);
      await prisma.request.updateMany({
        where: { id: { in: [late, lateDone] } },
        data: { createdAt, dueAt },
      });
      await setStatus(carla, lateDone, 'IN_PROGRESS').expect(200);
      await setStatus(carla, lateDone, 'DONE').expect(200);

      const overdue = await list(ana, { overdue: 'true' }).expect(200);

      expect(titles(overdue)).toEqual(['Vencida']);
      expect(overdue.body.items[0].overdue).toBe(true);
    });

    it('pagina e informa o total', async () => {
      for (const title of ['Primeira', 'Segunda', 'Terceira']) {
        await openId(ana, { title });
      }

      const { body } = await list(ana, { page: 2, pageSize: 2 }).expect(200);

      expect(body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
      expect(titles({ body } as request.Response)).toEqual(['Primeira']);
    });

    it('responde 400 para filtro inválido', async () => {
      await list(ana, { status: 'CANCELADO' }).expect(400);
      await list(ana, { from: '2026-10-02', to: '2026-10-01' }).expect(400);
    });
  });

  describe('exportar', () => {
    const exportAs = (cookie: string, format: string, query: object = {}) =>
      http().get(`/api/requests/export/${format}`).query(query).set('Cookie', cookie);

    it('CSV traz as solicitações filtradas, só as que a pessoa pode ver', async () => {
      await openId(ana, { title: 'Impressora sem toner' });
      await openId(ana, { title: 'Comprar cadeiras', categoryId: compras.id });
      await openId(bruno, { title: 'Do Bruno' });

      const response = await exportAs(ana, 'csv', { categoryId: compras.id }).expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('solicitacoes.csv');
      const lines = response.text.trim().split('\n');
      expect(lines[0]).toContain('Código;Título;Categoria');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('Comprar cadeiras;Compras;ana');
    });

    it('Word devolve um arquivo .docx', async () => {
      await openId(ana);

      const response = await exportAs(ana, 'docx')
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('wordprocessingml');
      // Todo .docx é um zip: começa com "PK".
      expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    });

    it('recusa formato desconhecido (400) e exige sessão (401)', async () => {
      await exportAs(ana, 'pdf').expect(400);
      await http().get('/api/requests/export/csv').expect(401);
    });
  });

  describe('ver, editar e excluir', () => {
    it('outro colaborador recebe 404, como se a solicitação não existisse', async () => {
      const id = await openId(ana);

      await detail(carla, id).expect(200);
      const { body } = await detail(bruno, id).expect(404);

      expect(body.detail).toBe('Solicitação não encontrada');
    });

    it('o dono edita enquanto está em Aberto', async () => {
      const id = await openId(ana);

      const { body } = await edit(ana, id, { title: 'Notebook não carrega' }).expect(200);

      expect(body.title).toBe('Notebook não carrega');
      expect(body.description).toBe('Parou de ligar ontem à tarde.');
    });

    it('o atendente não edita nem exclui a solicitação de outra pessoa (403)', async () => {
      const id = await openId(ana);

      await edit(carla, id, { title: 'Invasão' }).expect(403);
      await remove(carla, id).expect(403);
    });

    it('depois que o atendimento começa, o dono não edita nem exclui (409)', async () => {
      const id = await openId(ana);
      await setStatus(carla, id, 'IN_PROGRESS').expect(200);

      await edit(ana, id, { title: 'Tarde demais' }).expect(409);
      await remove(ana, id).expect(409);
    });

    it('trocar para uma categoria de prazo maior não adia o prazo', async () => {
      const { body: opened } = await open(ana).expect(201);

      const { body } = await edit(ana, opened.id, { categoryId: compras.id }).expect(200);

      expect(body.category.name).toBe('Compras');
      expect(body.dueAt).toBe(opened.dueAt);
    });

    it('excluir tira a solicitação da lista e do detalhe, mas a linha fica no banco', async () => {
      const id = await openId(ana);

      await remove(ana, id).expect(204);

      await detail(ana, id).expect(404);
      expect((await list(carla).expect(200)).body.total).toBe(0);
      const row = await prisma.request.findUnique({ where: { id } });
      expect(row?.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('mudar o status', () => {
    it('o atendente leva de Aberto a Concluído, e cada passo fica no histórico', async () => {
      const id = await openId(ana);

      await setStatus(carla, id, 'IN_PROGRESS').expect(200);
      const { body } = await setStatus(carla, id, 'DONE').expect(200);

      expect(body.status).toBe('DONE');
      expect(body.history.map((entry: { toStatus: string }) => entry.toStatus)).toEqual([
        'OPEN',
        'IN_PROGRESS',
        'DONE',
      ]);
    });

    it('não pula etapa nem volta (409)', async () => {
      const id = await openId(ana);

      await setStatus(carla, id, 'DONE').expect(409);
      await setStatus(carla, id, 'IN_PROGRESS').expect(200);
      const { body } = await setStatus(carla, id, 'OPEN').expect(409);

      expect(body.detail).toBe(
        'Transição inválida: de "Em Atendimento" não é possível ir para "Aberto"',
      );
    });

    it('colaborador não muda o status, nem o da própria solicitação (403)', async () => {
      const id = await openId(ana);

      await setStatus(ana, id, 'IN_PROGRESS').expect(403);
    });

    it('quem inicia vira o responsável, e só ele conclui', async () => {
      const dora = await cookieOf('dora', 'AGENT');
      const id = await openId(ana);

      const started = await setStatus(carla, id, 'IN_PROGRESS').expect(200);
      expect(started.body.assignee).toEqual({ id: 3, name: 'carla' });

      await setStatus(dora, id, 'DONE').expect(403);
      await setStatus(carla, id, 'DONE').expect(200);
    });

    it('atendente não muda o status da solicitação que ele mesmo abriu (403)', async () => {
      const id = await openId(carla);

      await setStatus(carla, id, 'IN_PROGRESS').expect(403);
    });

    it('dois pedidos ao mesmo tempo: um passa e o outro recebe 409', async () => {
      const id = await openId(ana);

      const responses = await Promise.all([
        setStatus(carla, id, 'IN_PROGRESS'),
        setStatus(carla, id, 'IN_PROGRESS'),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      await expect(prisma.requestStatusHistory.count()).resolves.toBe(2);
    });
  });
});
