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

// Horário de Fortaleza (UTC-3, o APP_TIMEZONE dos testes) escrito com o offset. 28/09/2026 é
// uma segunda-feira; 25/09/2026, uma sexta.
const at = (local: string) => new Date(`${local}-03:00`);
// Prazo ainda por vencer quando o teste roda.
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

  // Grava a solicitação direto no banco, para controlar abertura, prazo, início e conclusão.
  // Início e conclusão em horas corridas contadas da abertura; o painel responde em horas
  // úteis (segunda a sexta, 08:00–18:00). Fora de Aberto, a carla é a responsável.
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

    // Ana, tudo aberto na segunda às 08:00: uma aberta com o prazo vencido, uma em atendimento
    // no prazo (iniciada em 1 h) e uma concluída no prazo (iniciada em 4 h, concluída em 10 h,
    // às 18:00; o prazo vencido depois da conclusão não conta como atraso).
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
    // Bruno: uma aberta no prazo e uma aberta na sexta às 17:00, iniciada na segunda às 09:00
    // (64 h corridas, 2 h úteis) e concluída às 15:00 (70 h corridas, 8 h úteis), depois do
    // prazo das 10:00.
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
      // Média de 1 h e 4 h.
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
      // Média de 1 h, 4 h e 2 h úteis (2,33), com uma casa.
      averageTimeToStartHours: 2.3,
      // Média de 10 h e 8 h úteis; em horas corridas daria 40 h.
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
      averageTimeToStartHours: null,
      averageResolutionHours: null,
    });
  });

  it('exige sessão', async () => {
    await request(app.getHttpServer()).get('/api/dashboard/summary').expect(401);
  });
});
