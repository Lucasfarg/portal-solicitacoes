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

// Fortaleza é UTC-3 (APP_TIMEZONE dos testes). 28/09/2026 é segunda; 25/09/2026, sexta.
const at = (local: string) => new Date(`${local}-03:00`);
const notDueYet = () => new Date(Date.now() + 22 * HOUR);

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

  // Horas de início e conclusão corridas; o painel responde em úteis (seg a sex, 08:00-18:00).
  async function seedRequest(options: {
    requesterId: number;
    status: RequestStatus;
    openedAt: Date;
    dueAt: Date;
    startedAfterHours?: number;
    doneAfterHours?: number;
  }) {
    const createdAt = options.openedAt;
    const hoursAfterOpening = (hours: number) => new Date(createdAt.getTime() + hours * HOUR);
    const history: {
      fromStatus: RequestStatus | null;
      toStatus: RequestStatus;
      changedAt: Date;
    }[] = [{ fromStatus: null, toStatus: 'OPEN', changedAt: createdAt }];
    if (options.startedAfterHours !== undefined) {
      history.push({
        fromStatus: 'OPEN',
        toStatus: 'IN_PROGRESS',
        changedAt: hoursAfterOpening(options.startedAfterHours),
      });
    }
    if (options.doneAfterHours !== undefined) {
      history.push({
        fromStatus: 'IN_PROGRESS',
        toStatus: 'DONE',
        changedAt: hoursAfterOpening(options.doneAfterHours),
      });
    }
    await prisma.request.create({
      data: {
        title: 'Solicitação de teste',
        description: 'Descrição',
        categoryId,
        requesterId: options.requesterId,
        assigneeId: options.status === 'OPEN' ? null : carla.id,
        status: options.status,
        createdAt,
        dueAt: options.dueAt,
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

    const monday = at('2026-09-28T08:00:00');
    await seedRequest({
      requesterId: ana.id,
      status: 'OPEN',
      openedAt: monday,
      dueAt: at('2026-09-29T08:00:00'),
    });
    await seedRequest({
      requesterId: ana.id,
      status: 'IN_PROGRESS',
      openedAt: monday,
      dueAt: notDueYet(),
      startedAfterHours: 1,
    });
    await seedRequest({
      requesterId: ana.id,
      status: 'DONE',
      openedAt: monday,
      dueAt: at('2026-09-30T12:00:00'),
      startedAfterHours: 4,
      doneAfterHours: 10,
    });
    // Bruno: iniciada às 09:00 (64 h corridas, 2 h úteis), concluída às 15:00 (70 h, 8 h úteis).
    await seedRequest({
      requesterId: bruno.id,
      status: 'OPEN',
      openedAt: monday,
      dueAt: notDueYet(),
    });
    await seedRequest({
      requesterId: bruno.id,
      status: 'DONE',
      openedAt: at('2026-09-25T17:00:00'),
      dueAt: at('2026-09-28T10:00:00'),
      startedAfterHours: 64,
      doneAfterHours: 70,
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
      completedLate: 0,
      byCategory: [{ name: 'TI', total: 3 }],
      averageTimeToStartHours: 2.5,
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
      completedLate: 1,
      byCategory: [{ name: 'TI', total: 5 }],
      averageTimeToStartHours: 2.3,
      // Em horas corridas daria 40 h.
      averageResolutionHours: 9,
    });
  });

  it('quem não tem solicitações recebe zeros e tempos médios nulos', async () => {
    const dora = await createUser(app, 'dora');

    expect(await summaryOf(dora.id)).toEqual({
      total: 0,
      open: 0,
      inProgress: 0,
      done: 0,
      overdue: 0,
      completedLate: 0,
      byCategory: [],
      averageTimeToStartHours: null,
      averageResolutionHours: null,
    });
  });

  it('exige sessão', async () => {
    await request(app.getHttpServer()).get('/api/dashboard/summary').expect(401);
  });
});
