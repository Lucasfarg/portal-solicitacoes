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
  // Cookies de sessão: ana e bruno são colaboradores; carla é atendente.
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

  // Prazo esperado: o mesmo cálculo de horas úteis da API (as contas têm teste unitário).
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

  describe('POST /api/requests', () => {
    it('abre em Aberto, sem responsável, com prazo pelo SLA e o registro de abertura', async () => {
      const { body } = await open(ana).expect(201);

      expect(body).toMatchObject({
        id: 1,
        code: 'SOL-000001',
        title: 'Notebook não liga',
        description: 'Parou de ligar ontem à tarde.',
        status: 'OPEN',
        category: { id: ti.id, name: 'TI' },
        requester: { id: 1, name: 'ana' },
        assignee: null,
      });
      // TI tem SLA de 24 h úteis.
      expect(body.dueAt).toBe(expectedDue(body.createdAt, 24));
      expect(body.history).toEqual([
        {
          fromStatus: null,
          toStatus: 'OPEN',
          changedBy: { id: 1, name: 'ana' },
          changedAt: body.createdAt,
        },
      ]);
    });

    it('ignora solicitante e status enviados no corpo: valem a sessão e Aberto', async () => {
      const { body } = await open(ana, { requesterId: 2, status: 'DONE' }).expect(201);

      expect(body.requester.name).toBe('ana');
      expect(body.status).toBe('OPEN');
    });

    it('responde 400 com os campos inválidos', async () => {
      const { body } = await open(ana, { title: 'ab', description: '  ', categoryId: 'x' }).expect(
        400,
      );

      expect(body.errors.map((e: { path: string }) => e.path)).toEqual([
        'title',
        'description',
        'categoryId',
      ]);
    });

    it('conta caracteres como o banco: título de dois emojis é curto (400, não 500)', async () => {
      const { body } = await open(ana, { title: '😀😀' }).expect(400);

      expect(body.errors).toEqual([
        { path: 'title', message: 'O título precisa de pelo menos 3 caracteres' },
      ]);
      await open(ana, { title: '😀😀😀' }).expect(201);
    });

    it.each([
      ['inativa', () => inactive.id],
      ['inexistente', () => 999],
    ])('responde 400 apontando o campo quando a categoria é %s', async (_label, categoryId) => {
      const { body } = await open(ana, { categoryId: categoryId() }).expect(400);

      expect(body.errors).toEqual([
        { path: 'categoryId', message: 'Categoria inexistente ou inativa' },
      ]);
      await expect(prisma.request.count()).resolves.toBe(0);
    });

    it('exige sessão', async () => {
      await http().post('/api/requests').set(CSRF).send({}).expect(401);
    });
  });

  describe('GET /api/requests', () => {
    it('colaborador vê só as próprias; atendente vê todas, da mais nova para a mais antiga', async () => {
      await openId(ana, { title: 'Da Ana' });
      await openId(bruno, { title: 'Do Bruno' });

      expect(titles(await list(ana).expect(200))).toEqual(['Da Ana']);
      expect(titles(await list(bruno).expect(200))).toEqual(['Do Bruno']);
      expect(titles(await list(carla).expect(200))).toEqual(['Do Bruno', 'Da Ana']);
    });

    it('filtra por status, por categoria e por texto no título (sem diferenciar maiúsculas)', async () => {
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
      expect(titles(await list(ana, { status: 'OPEN', q: 'impressora' }).expect(200))).toEqual([]);
    });

    it('filtra o período pelo dia de Fortaleza, com as duas pontas inclusas', async () => {
      // 00:00 em Fortaleza = 03:00 UTC.
      const openedAt = {
        '30/09 23:59': '2026-10-01T02:59:59Z',
        '01/10 00:00': '2026-10-01T03:00:00Z',
        '01/10 23:59': '2026-10-02T02:59:59Z',
        '02/10 00:00': '2026-10-02T03:00:00Z',
      };
      for (const [title, createdAt] of Object.entries(openedAt)) {
        const id = await openId(ana, { title });
        await prisma.request.update({ where: { id }, data: { createdAt } });
      }

      const oneDay = await list(ana, { from: '2026-10-01', to: '2026-10-01' }).expect(200);
      expect(titles(oneDay)).toEqual(['01/10 23:59', '01/10 00:00']);

      const fromOnly = await list(ana, { from: '2026-10-02' }).expect(200);
      expect(titles(fromOnly)).toEqual(['02/10 00:00']);

      const toOnly = await list(ana, { to: '2026-09-30' }).expect(200);
      expect(titles(toOnly)).toEqual(['30/09 23:59']);
    });

    it('filtra as fora do prazo: não concluídas e com o prazo vencido', async () => {
      const late = await openId(ana, { title: 'Vencida em Aberto' });
      const lateInProgress = await openId(ana, { title: 'Vencida em atendimento' });
      const lateDone = await openId(ana, { title: 'Vencida e concluída' });
      await openId(ana, { title: 'No prazo' });
      // Abertas há dois dias, com o prazo vencido há uma hora (o prazo é sempre depois da abertura).
      const openedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const past = new Date(Date.now() - 60 * 60 * 1000);
      for (const id of [late, lateInProgress, lateDone]) {
        await prisma.request.update({ where: { id }, data: { createdAt: openedAt, dueAt: past } });
      }
      await setStatus(carla, lateInProgress, 'IN_PROGRESS').expect(200);
      await setStatus(carla, lateDone, 'IN_PROGRESS').expect(200);
      await setStatus(carla, lateDone, 'DONE').expect(200);

      expect(titles(await list(ana, { overdue: 'true' }).expect(200))).toEqual([
        'Vencida em atendimento',
        'Vencida em Aberto',
      ]);
      expect(titles(await list(ana, { overdue: 'true', status: 'OPEN' }).expect(200))).toEqual([
        'Vencida em Aberto',
      ]);
    });

    it('pagina e informa o total', async () => {
      for (const title of ['Primeira', 'Segunda', 'Terceira']) {
        await openId(ana, { title });
      }

      const { body } = await list(ana, { page: 2, pageSize: 2 }).expect(200);

      expect(body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
      expect(body.items.map((item: { title: string }) => item.title)).toEqual(['Primeira']);
    });

    it('com asOf, as abertas depois não entram e a página 2 não muda', async () => {
      await openId(ana, { title: 'Primeira' });
      await openId(ana, { title: 'Segunda' });
      const { body: third } = await open(ana, { title: 'Terceira' }).expect(201);
      const secondPage = { page: 2, pageSize: 2, asOf: third.createdAt };
      expect(titles(await list(ana, secondPage).expect(200))).toEqual(['Primeira']);

      await openId(ana, { title: 'Quarta' });

      const samePage = await list(ana, secondPage).expect(200);
      expect(titles(samePage)).toEqual(['Primeira']);
      expect(samePage.body.total).toBe(3);
      // Sem asOf, a nova empurra os itens para a página seguinte.
      expect(titles(await list(ana, { page: 2, pageSize: 2 }).expect(200))).toEqual([
        'Segunda',
        'Primeira',
      ]);
    });

    it('sem parâmetros usa página 1 com 10 itens', async () => {
      const { body } = await list(ana).expect(200);

      expect(body).toEqual({
        items: [],
        page: 1,
        pageSize: 10,
        total: 0,
        asOf: expect.any(String),
      });
    });

    it('sem asOf, devolve o instante da API que fixou a lista; com ele, o mesmo pedido', async () => {
      const before = Date.now();
      const { body } = await list(ana).expect(200);
      expect(Date.parse(body.asOf)).toBeGreaterThanOrEqual(before);
      expect(Date.parse(body.asOf)).toBeLessThanOrEqual(Date.now());

      const asOf = '2026-10-01T12:00:00.000Z';
      expect((await list(ana, { asOf }).expect(200)).body.asOf).toBe(asOf);
    });

    it('a lista não traz a descrição; o detalhe traz', async () => {
      const id = await openId(ana, { description: 'Só no detalhe' });

      const { body } = await list(ana).expect(200);
      expect(body.items[0]).not.toHaveProperty('description');
      expect((await detail(ana, id).expect(200)).body.description).toBe('Só no detalhe');
    });

    it.each([
      [{ status: 'CANCELADO' }, 'status'],
      [{ page: 0 }, 'page'],
      [{ pageSize: 101 }, 'pageSize'],
      [{ from: '01/10/2026' }, 'from'],
      [{ from: '2026-10-02', to: '2026-10-01' }, 'to'],
      [{ overdue: 'sim' }, 'overdue'],
      [{ asOf: '2026-10-05' }, 'asOf'],
    ])('responde 400 para o filtro inválido %o', async (query, path) => {
      const { body } = await list(ana, query).expect(400);

      expect(body.errors.map((e: { path: string }) => e.path)).toEqual([path]);
    });
  });

  describe('GET /api/requests/:id', () => {
    it('o dono e o atendente veem o detalhe; outro colaborador recebe 404', async () => {
      const id = await openId(ana);

      expect((await detail(ana, id).expect(200)).body.code).toBe('SOL-000001');
      expect((await detail(carla, id).expect(200)).body.history).toHaveLength(1);
      // 404, e não 403: a resposta não revela que aquele número existe.
      const hidden = await detail(bruno, id).expect(404);
      expect(hidden.headers['content-type']).toContain('application/problem+json');
      expect(hidden.body.detail).toBe('Solicitação não encontrada');
    });

    it('responde 404 para id que não existe e 400 para id que não é número', async () => {
      await detail(ana, 999).expect(404);
      await detail(ana, 'abc').expect(400);
    });
  });

  describe('PATCH /api/requests/:id', () => {
    it('o dono edita enquanto está em Aberto; o histórico não muda', async () => {
      const id = await openId(ana);

      const { body } = await edit(ana, id, { title: 'Notebook não carrega' }).expect(200);

      expect(body.title).toBe('Notebook não carrega');
      expect(body.description).toBe('Parou de ligar ontem à tarde.');
      expect(body.history).toHaveLength(1);
    });

    it('trocar para uma categoria de SLA maior não adia o prazo', async () => {
      const { body: opened } = await open(ana).expect(201);

      const { body } = await edit(ana, opened.id, { categoryId: compras.id }).expect(200);

      expect(body.category.name).toBe('Compras');
      expect(body.dueAt).toBe(opened.dueAt);
    });

    it('trocar para uma categoria de SLA menor encurta o prazo, contado da abertura', async () => {
      const { body: opened } = await open(ana, { categoryId: compras.id }).expect(201);

      const { body } = await edit(ana, opened.id, { categoryId: ti.id }).expect(200);

      expect(body.dueAt).toBe(expectedDue(opened.createdAt, 24));
      expect(Date.parse(body.dueAt)).toBeLessThan(Date.parse(opened.dueAt));
    });

    it('responde 404 para outro colaborador e 403 para o atendente', async () => {
      const id = await openId(ana);

      await edit(bruno, id, { title: 'Invasão' }).expect(404);
      await edit(carla, id, { title: 'Invasão' }).expect(403);
      expect((await detail(ana, id)).body.title).toBe('Notebook não liga');
    });

    it('responde 409 depois que a solicitação saiu de Aberto', async () => {
      const id = await openId(ana);
      await setStatus(carla, id, 'IN_PROGRESS').expect(200);

      const { body } = await edit(ana, id, { title: 'Tarde demais' }).expect(409);

      expect(body.detail).toContain('Em Atendimento');
    });

    it('responde 400 para corpo vazio ou categoria inativa, e 404 para id inexistente', async () => {
      const id = await openId(ana);

      await edit(ana, id, {}).expect(400);
      await edit(ana, id, { categoryId: inactive.id }).expect(400);
      await edit(ana, 999, { title: 'Não existe' }).expect(404);
    });
  });

  describe('DELETE /api/requests/:id', () => {
    it('o dono exclui em Aberto: some da lista, do detalhe e do painel, mas a linha fica', async () => {
      const id = await openId(ana);

      await remove(ana, id).expect(204);

      await detail(ana, id).expect(404);
      await detail(carla, id).expect(404);
      expect((await list(ana).expect(200)).body.total).toBe(0);
      expect((await list(carla).expect(200)).body.total).toBe(0);
      const summary = await http().get('/api/dashboard/summary').set('Cookie', carla).expect(200);
      expect(summary.body.total).toBe(0);
      // Exclusão lógica: a linha e o histórico continuam no banco, marcados com deleted_at.
      const row = await prisma.request.findUnique({ where: { id } });
      expect(row?.deletedAt).toBeInstanceOf(Date);
      await expect(prisma.requestStatusHistory.count()).resolves.toBe(1);
    });

    it('a excluída não se exclui de novo, nem se edita, nem muda de status (404)', async () => {
      const id = await openId(ana);
      await remove(ana, id).expect(204);

      await remove(ana, id).expect(404);
      await edit(ana, id, { title: 'Depois de excluída' }).expect(404);
      await setStatus(carla, id, 'IN_PROGRESS').expect(404);
    });

    it('responde 404 para outro colaborador e 403 para o atendente', async () => {
      const id = await openId(ana);

      await remove(bruno, id).expect(404);
      await remove(carla, id).expect(403);
      await detail(ana, id).expect(200);
    });

    it('responde 409 depois que a solicitação saiu de Aberto', async () => {
      const id = await openId(ana);
      await setStatus(carla, id, 'IN_PROGRESS').expect(200);

      await remove(ana, id).expect(409);
      await detail(ana, id).expect(200);
    });
  });

  describe('PATCH /api/requests/:id/status', () => {
    it('o atendente leva de Aberto a Concluído, e cada passo fica no histórico', async () => {
      const id = await openId(ana);

      await setStatus(carla, id, 'IN_PROGRESS').expect(200);
      const { body } = await setStatus(carla, id, 'DONE').expect(200);

      expect(body.status).toBe('DONE');
      expect(
        body.history.map((entry: { fromStatus: string; toStatus: string; changedBy: object }) => [
          entry.fromStatus,
          entry.toStatus,
          entry.changedBy,
        ]),
      ).toEqual([
        [null, 'OPEN', { id: 1, name: 'ana' }],
        ['OPEN', 'IN_PROGRESS', { id: 3, name: 'carla' }],
        ['IN_PROGRESS', 'DONE', { id: 3, name: 'carla' }],
      ]);
    });

    it('responde 403 para colaborador, mesmo sendo o dono, e 404 para outro colaborador', async () => {
      const id = await openId(ana);

      await setStatus(ana, id, 'IN_PROGRESS').expect(403);
      await setStatus(bruno, id, 'IN_PROGRESS').expect(404);
      expect((await detail(ana, id)).body.status).toBe('OPEN');
    });

    it('quem inicia o atendimento vira o responsável, na resposta, no detalhe e na lista', async () => {
      const id = await openId(ana);

      const { body } = await setStatus(carla, id, 'IN_PROGRESS').expect(200);

      expect(body.assignee).toEqual({ id: 3, name: 'carla' });
      expect((await detail(ana, id)).body.assignee).toEqual({ id: 3, name: 'carla' });
      expect((await list(ana).expect(200)).body.items[0].assignee).toEqual({
        id: 3,
        name: 'carla',
      });
    });

    it('só o responsável conclui: outro atendente recebe 403', async () => {
      const dora = await cookieOf('dora', 'AGENT');
      const id = await openId(ana);
      await setStatus(carla, id, 'IN_PROGRESS').expect(200);

      const { body } = await setStatus(dora, id, 'DONE').expect(403);
      expect(body.detail).toBe('Só o responsável pelo atendimento pode concluí-lo');

      const done = await setStatus(carla, id, 'DONE').expect(200);
      expect(done.body.status).toBe('DONE');
      expect(done.body.assignee).toEqual({ id: 3, name: 'carla' });
    });

    it('atendente não muda o status da que ele mesmo abriu, mas a edita como dono', async () => {
      const dora = await cookieOf('dora', 'AGENT');
      const id = await openId(carla);

      const { body } = await setStatus(carla, id, 'IN_PROGRESS').expect(403);
      expect(body.detail).toBe(
        'Atendente não altera o status de uma solicitação que ele mesmo abriu',
      );
      await edit(carla, id, { title: 'Monitor piscando' }).expect(200);
      // Outro atendente atende normalmente.
      await setStatus(dora, id, 'IN_PROGRESS').expect(200);
    });

    it('responde 409 ao pular etapa, repetir o status ou voltar', async () => {
      const id = await openId(ana);

      await setStatus(carla, id, 'DONE').expect(409);
      await setStatus(carla, id, 'OPEN').expect(409);
      await setStatus(carla, id, 'IN_PROGRESS').expect(200);
      await setStatus(carla, id, 'OPEN').expect(409);
      await setStatus(carla, id, 'DONE').expect(200);
      const { body } = await setStatus(carla, id, 'IN_PROGRESS').expect(409);

      expect(body.detail).toBe(
        'Transição inválida: de "Concluído" não é possível ir para "Em Atendimento"',
      );
      await expect(prisma.requestStatusHistory.count()).resolves.toBe(3);
    });

    it('responde 400 para status desconhecido e 404 para id inexistente', async () => {
      const id = await openId(ana);

      await setStatus(carla, id, 'CANCELADO').expect(400);
      await setStatus(carla, 999, 'IN_PROGRESS').expect(404);
    });

    it('dois pedidos simultâneos para a mesma mudança: um passa, o outro recebe 409', async () => {
      const id = await openId(ana);

      const responses = await Promise.all([
        setStatus(carla, id, 'IN_PROGRESS'),
        setStatus(carla, id, 'IN_PROGRESS'),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
      // Abertura + uma única mudança: o pedido recusado não deixou registro.
      await expect(prisma.requestStatusHistory.count()).resolves.toBe(2);
    });
  });

  it('publica as rotas no OpenAPI, com os filtros da listagem vindos do schema Zod', async () => {
    const { body } = await http().get('/api/docs-json').expect(200);

    expect(Object.keys(body.paths)).toEqual(
      expect.arrayContaining([
        '/api/categories',
        '/api/requests',
        '/api/requests/{id}',
        '/api/requests/{id}/status',
        '/api/dashboard/summary',
      ]),
    );
    const filters = body.paths['/api/requests'].get.parameters.map(
      (parameter: { name: string }) => parameter.name,
    );
    expect(filters).toEqual(
      expect.arrayContaining([
        'status',
        'categoryId',
        'from',
        'to',
        'q',
        'asOf',
        'page',
        'pageSize',
      ]),
    );
  });
});
