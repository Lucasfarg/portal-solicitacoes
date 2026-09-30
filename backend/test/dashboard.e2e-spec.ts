import type { NestExpressApplication } from '@nestjs/platform-express';
import type { RequestStatus } from '@portal/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createCategory,
  createTestApp,
  createUser,
  resetDatabase,
  sessionCookieFor,
} from './helpers.js';

const HOUR = 3_600_000;

describe('Dashboard (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let ana: { id: number };
  let bruno: { id: number };
  let carla: { id: number };
  let categoryId: number;

  const summaryOf = async (userId: number) => {
    const { cookie } = await sessionCookieFor(app, userId);
    const response = await request(app.getHttpServer())
      .get('/api/dashboard/summary')
      .set('Cookie', cookie)
      .expect(200);
    return response.body;
  };

  // Grava a solicitação direto no banco, para controlar abertura, prazo e conclusão.
  // Os tempos são em horas a partir de agora (negativo = passado).
  async function seedRequest(options: {
    requesterId: number;
    status: RequestStatus;
    openedHoursAgo: number;
    dueInHours: number;
    doneAfterHours?: number;
  }) {
    const createdAt = new Date(Date.now() - options.openedHoursAgo * HOUR);
    const history: {
      fromStatus: RequestStatus | null;
      toStatus: RequestStatus;
      changedAt: Date;
    }[] = [{ fromStatus: null, toStatus: 'OPEN', changedAt: createdAt }];
    if (options.doneAfterHours !== undefined) {
      history.push({
        fromStatus: 'IN_PROGRESS',
        toStatus: 'DONE',
        changedAt: new Date(createdAt.getTime() + options.doneAfterHours * HOUR),
      });
    }
    await prisma.request.create({
      data: {
        title: 'Solicitação de teste',
        description: 'Descrição',
        categoryId,
        requesterId: options.requesterId,
        status: options.status,
        createdAt,
        dueAt: new Date(Date.now() + options.dueInHours * HOUR),
        history: { create: history.map((entry) => ({ ...entry, changedById: carla.id })) },
      },
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(app);
    ana = await createUser(app, 'ana');
    bruno = await createUser(app, 'bruno');
    carla = await createUser(app, 'carla', 'AGENT');
    categoryId = (await createCategory(app, 'TI', 24)).id;

    // Ana: uma aberta com o prazo vencido, uma em atendimento no prazo
    // e uma concluída em 10 h (o prazo vencido dela não conta como atraso).
    await seedRequest({ requesterId: ana.id, status: 'OPEN', openedHoursAgo: 30, dueInHours: -6 });
    await seedRequest({
      requesterId: ana.id,
      status: 'IN_PROGRESS',
      openedHoursAgo: 2,
      dueInHours: 22,
    });
    await seedRequest({
      requesterId: ana.id,
      status: 'DONE',
      openedHoursAgo: 40,
      dueInHours: -16,
      doneAfterHours: 10,
    });
    // Bruno: uma aberta no prazo e uma concluída em 20 h.
    await seedRequest({ requesterId: bruno.id, status: 'OPEN', openedHoursAgo: 1, dueInHours: 23 });
    await seedRequest({
      requesterId: bruno.id,
      status: 'DONE',
      openedHoursAgo: 50,
      dueInHours: -26,
      doneAfterHours: 20,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('colaborador recebe os números só das próprias solicitações', async () => {
    expect(await summaryOf(ana.id)).toEqual({
      total: 3,
      open: 1,
      inProgress: 1,
      done: 1,
      overdue: 1,
      averageResolutionHours: 10,
    });
  });

  it('atendente recebe os números de todas', async () => {
    expect(await summaryOf(carla.id)).toEqual({
      total: 5,
      open: 2,
      inProgress: 1,
      done: 2,
      overdue: 1,
      // Média de 10 h e 20 h.
      averageResolutionHours: 15,
    });
  });

  it('quem não tem solicitações recebe zeros e tempo médio nulo', async () => {
    const dora = await createUser(app, 'dora');

    expect(await summaryOf(dora.id)).toEqual({
      total: 0,
      open: 0,
      inProgress: 0,
      done: 0,
      overdue: 0,
      averageResolutionHours: null,
    });
  });

  it('exige sessão', async () => {
    await request(app.getHttpServer()).get('/api/dashboard/summary').expect(401);
  });
});
