import type { RequestStatus } from '@portal/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from './auth/password.js';
import { DEFAULT_TIMEZONE } from './config/env.js';
import { PrismaClient } from './generated/prisma/client.js';
import { dueDate } from './requests/request-rules.js';

// Dados de demonstração. Idempotente: roda a cada subida do container sem duplicar
// nem sobrescrever o que já existe (upsert sem alteração).

// Local: usa o .env da raiz do repo. No Docker a variável já vem do ambiente.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {}

const DEMO_PASSWORD = 'Senha@123';

const CATEGORIES = [
  { name: 'TI', slaHours: 24 },
  { name: 'Infraestrutura', slaHours: 48 },
  { name: 'RH', slaHours: 72 },
  { name: 'Financeiro', slaHours: 72 },
  { name: 'Compras', slaHours: 120 },
];

const USERS = [
  { name: 'Ana Souza', username: 'ana', role: 'REQUESTER' },
  { name: 'Bruno Lima', username: 'bruno', role: 'REQUESTER' },
  { name: 'Carla Mendes', username: 'carla', role: 'AGENT' },
] as const;

// Solicitações de exemplo, com as datas contadas a partir da hora do seed: há casos no
// prazo, fora do prazo, em atendimento e concluídos. Quem atende é sempre a carla.
// O prazo conta horas úteis e o dia do seed varia: as "no prazo" foram abertas há menos horas
// que o SLA (o tempo útil nunca passa do corrido), e as "fora do prazo" há mais que o pior
// caso de calendário (abertura numa sexta à noite, fim de semana no meio).
interface SampleRequest {
  title: string;
  description: string;
  category: string;
  requester: 'ana' | 'bruno';
  openedHoursAgo: number;
  startedHoursAgo?: number;
  doneHoursAgo?: number;
}

const SAMPLE_REQUESTS: SampleRequest[] = [
  {
    title: 'Notebook não liga depois da atualização',
    description:
      'Depois da atualização de ontem à noite o notebook fica na tela preta ao ligar.\nPatrimônio 10234.',
    category: 'TI',
    requester: 'ana',
    openedHoursAgo: 2,
  },
  {
    title: 'Troca das lâmpadas do corredor do 2º andar',
    description: 'Três lâmpadas queimadas perto da escada; o corredor fica escuro no fim da tarde.',
    category: 'Infraestrutura',
    requester: 'ana',
    openedHoursAgo: 5,
  },
  {
    title: 'Cadeira ergonômica para a recepção',
    description: 'A cadeira atual está com o encosto quebrado. Pedido aprovado pela coordenação.',
    category: 'Compras',
    requester: 'ana',
    openedHoursAgo: 30,
  },
  {
    title: 'Acesso à pasta compartilhada do Financeiro',
    description: 'Preciso de leitura na pasta \\\\arquivos\\financeiro\\2026 para o fechamento.',
    category: 'TI',
    requester: 'bruno',
    // Fora do prazo: 24 h úteis levam no máximo umas 114 h corridas.
    openedHoursAgo: 130,
  },
  {
    title: 'Toner para a impressora do 2º andar',
    description: 'Impressora HP do 2º andar sem toner preto.',
    category: 'Compras',
    requester: 'bruno',
    openedHoursAgo: 150,
  },
  {
    title: 'Ar-condicionado da sala 3 pingando',
    description: 'O aparelho pinga sobre a mesa de reunião desde segunda.',
    category: 'Infraestrutura',
    requester: 'bruno',
    // Em atendimento e fora do prazo: 48 h úteis levam no máximo umas 166 h corridas.
    openedHoursAgo: 180,
    startedHoursAgo: 170,
  },
  {
    title: 'Atualização de dados bancários para a folha',
    description: 'Mudei de banco; envio o comprovante da conta nova quando pedirem.',
    category: 'RH',
    requester: 'ana',
    openedHoursAgo: 20,
    startedHoursAgo: 4,
  },
  {
    title: 'Reembolso de viagem a Campina Grande',
    description: 'Viagem de 22 a 24/09 para visita ao cliente. Notas fiscais em anexo no e-mail.',
    category: 'Financeiro',
    requester: 'bruno',
    openedHoursAgo: 100,
    startedHoursAgo: 90,
    doneHoursAgo: 70,
  },
  {
    title: 'Instalar a VPN no notebook novo',
    description: 'Notebook entregue hoje, ainda sem o cliente da VPN.',
    category: 'TI',
    requester: 'ana',
    openedHoursAgo: 72,
    startedHoursAgo: 66,
    doneHoursAgo: 60,
  },
  {
    title: 'Declaração de vínculo empregatício',
    description: 'Declaração para apresentar no banco, com cargo e data de admissão.',
    category: 'RH',
    requester: 'ana',
    // Concluída com atraso: 300 h corridas passam das 72 h úteis em qualquer dia da semana.
    openedHoursAgo: 400,
    startedHoursAgo: 380,
    doneHoursAgo: 100,
  },
];

interface Step {
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  changedById: number;
  changedAt: Date;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

try {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: category.name },
      create: category,
      update: {},
    });
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { username: user.username },
      create: { ...user, passwordHash },
      update: {},
    });
  }

  // Só num banco sem nenhuma solicitação: o que já foi criado ou mexido não é tocado.
  let created = 0;
  if ((await prisma.request.count()) === 0) {
    const categories = new Map((await prisma.category.findMany()).map((c) => [c.name, c]));
    const users = new Map((await prisma.user.findMany()).map((u) => [u.username, u.id]));
    const agentId = users.get('carla');
    const timeZone = process.env.APP_TIMEZONE ?? DEFAULT_TIMEZONE;
    const now = Date.now();
    const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000);

    for (const sample of SAMPLE_REQUESTS) {
      const category = categories.get(sample.category);
      const requesterId = users.get(sample.requester);
      if (!category || requesterId === undefined || agentId === undefined) {
        continue;
      }
      const openedAt = hoursAgo(sample.openedHoursAgo);
      const history: Step[] = [
        { fromStatus: null, toStatus: 'OPEN', changedById: requesterId, changedAt: openedAt },
      ];
      if (sample.startedHoursAgo !== undefined) {
        history.push({
          fromStatus: 'OPEN',
          toStatus: 'IN_PROGRESS',
          changedById: agentId,
          changedAt: hoursAgo(sample.startedHoursAgo),
        });
      }
      if (sample.doneHoursAgo !== undefined) {
        history.push({
          fromStatus: 'IN_PROGRESS',
          toStatus: 'DONE',
          changedById: agentId,
          changedAt: hoursAgo(sample.doneHoursAgo),
        });
      }

      await prisma.request.create({
        data: {
          title: sample.title,
          description: sample.description,
          categoryId: category.id,
          requesterId,
          // Quem iniciou o atendimento é o responsável; em Aberto não há (CHECK no banco).
          assigneeId: sample.startedHoursAgo === undefined ? null : agentId,
          status: history[history.length - 1].toStatus,
          createdAt: openedAt,
          dueAt: dueDate(openedAt, category.slaHours, timeZone),
          history: { create: history },
        },
      });
      created++;
    }
  }

  console.log(
    `Seed aplicado: ${CATEGORIES.length} categorias, ${USERS.length} usuários, ${created} solicitações de exemplo.`,
  );
} finally {
  await prisma.$disconnect();
}
