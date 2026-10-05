import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { canView, REQUEST_STATUSES, type RequestStatus } from '@portal/shared';
import {
  assertCanChangeStatus,
  assertCanModify,
  assertCanView,
  businessHoursBetween,
  dueDate,
  periodToUtcRange,
  visibleTo,
} from './request-rules.js';

const ana = { id: 1, name: 'Ana Souza', username: 'ana', role: 'REQUESTER' as const };
const bruno = { id: 2, name: 'Bruno Lima', username: 'bruno', role: 'REQUESTER' as const };
const carla = { id: 3, name: 'Carla Mendes', username: 'carla', role: 'AGENT' as const };

const dora = { id: 4, name: 'Dora Alves', username: 'dora', role: 'AGENT' as const };

const requestOfAna = (status: RequestStatus = 'OPEN') => ({ requesterId: ana.id, status });

// Solicitação já no fluxo de atendimento: em Aberto não tem responsável.
const assigned = (status: RequestStatus, assigneeId: number | null, requesterId = ana.id) => ({
  requesterId,
  status,
  assigneeId,
});

describe('Permissões', () => {
  describe('ver', () => {
    it('o dono vê a própria solicitação', () => {
      expect(canView(ana, requestOfAna())).toBe(true);
    });

    it('outro colaborador não vê, e recebe 404 para não saber que o número existe', () => {
      expect(canView(bruno, requestOfAna())).toBe(false);
      expect(() => assertCanView(bruno, requestOfAna())).toThrow(NotFoundException);
      expect(() => assertCanView(bruno, requestOfAna())).toThrow('Solicitação não encontrada');
    });

    it('o atendente vê a de qualquer pessoa', () => {
      expect(canView(carla, requestOfAna())).toBe(true);
    });

    it('a listagem do colaborador é filtrada pelo dono; a do atendente, não', () => {
      expect(visibleTo(ana)).toEqual({ requesterId: ana.id });
      expect(visibleTo(carla)).toEqual({});
    });
  });

  describe('editar e excluir', () => {
    it('o dono pode enquanto está em Aberto', () => {
      expect(() => assertCanModify(ana, requestOfAna('OPEN'))).not.toThrow();
    });

    it.each(['IN_PROGRESS', 'DONE'] as const)('o dono não pode em %s (409)', (status) => {
      expect(() => assertCanModify(ana, requestOfAna(status))).toThrow(ConflictException);
    });

    it('outro colaborador nem vê a solicitação (404)', () => {
      expect(() => assertCanModify(bruno, requestOfAna())).toThrow(NotFoundException);
    });

    it('o atendente não pode, porque não é o dono (403)', () => {
      expect(() => assertCanModify(carla, requestOfAna())).toThrow(ForbiddenException);
    });

    it('o atendente recebe 403 mesmo se a solicitação já saiu de Aberto', () => {
      expect(() => assertCanModify(carla, requestOfAna('DONE'))).toThrow(ForbiddenException);
    });

    it('o atendente edita a que ele mesmo abriu, como qualquer colaborador', () => {
      expect(() => assertCanModify(carla, assigned('OPEN', null, carla.id))).not.toThrow();
    });
  });
});

describe('Transições de status', () => {
  const VALID = ['OPEN>IN_PROGRESS', 'IN_PROGRESS>DONE'];

  // Todas as 9 combinações de origem e destino: só as duas de VALID passam.
  const pairs = REQUEST_STATUSES.flatMap((from) => REQUEST_STATUSES.map((to) => ({ from, to })));

  it.each(pairs)('atendente: $from → $to', ({ from, to }) => {
    const request = assigned(from, from === 'OPEN' ? null : carla.id);
    const attempt = () => assertCanChangeStatus(carla, request, to);

    if (VALID.includes(`${from}>${to}`)) {
      expect(attempt).not.toThrow();
    } else {
      expect(attempt).toThrow(ConflictException);
    }
  });

  it('colaborador não muda status, nem o da própria solicitação (403)', () => {
    expect(() => assertCanChangeStatus(ana, assigned('OPEN', null), 'IN_PROGRESS')).toThrow(
      ForbiddenException,
    );
  });

  it('colaborador recebe 404 na solicitação de outro', () => {
    expect(() => assertCanChangeStatus(bruno, assigned('OPEN', null), 'IN_PROGRESS')).toThrow(
      NotFoundException,
    );
  });

  it('atendente não muda o status de uma solicitação que ele mesmo abriu (403)', () => {
    expect(() =>
      assertCanChangeStatus(carla, assigned('OPEN', null, carla.id), 'IN_PROGRESS'),
    ).toThrow('Atendente não altera o status de uma solicitação que ele mesmo abriu');
    expect(() =>
      assertCanChangeStatus(dora, assigned('OPEN', null, carla.id), 'IN_PROGRESS'),
    ).not.toThrow();
  });

  it('só o responsável conclui; outro atendente recebe 403', () => {
    const inProgress = assigned('IN_PROGRESS', carla.id);

    expect(() => assertCanChangeStatus(carla, inProgress, 'DONE')).not.toThrow();
    expect(() => assertCanChangeStatus(dora, inProgress, 'DONE')).toThrow(ForbiddenException);
    expect(() => assertCanChangeStatus(dora, inProgress, 'DONE')).toThrow(
      'Só o responsável pelo atendimento pode concluí-lo',
    );
  });

  it('a mensagem da transição inválida usa os rótulos da tela', () => {
    expect(() => assertCanChangeStatus(carla, assigned('DONE', carla.id), 'OPEN')).toThrow(
      'Transição inválida: de "Concluído" não é possível ir para "Aberto"',
    );
  });
});

const FORTALEZA = 'America/Fortaleza';

describe('Prazo (SLA em horas úteis: segunda a sexta, 08:00–18:00)', () => {
  // Horários de Fortaleza (UTC-3) escritos com o offset, para o teste se ler como o relógio local.
  const at = (local: string) => new Date(`${local}-03:00`);

  it('dentro do expediente, soma as horas no mesmo dia', () => {
    // 05/10/2026 é uma segunda-feira.
    expect(dueDate(at('2026-10-05T09:00:00'), 2, FORTALEZA)).toEqual(at('2026-10-05T11:00:00'));
  });

  it('aberta na sexta às 17:00 com SLA de 2 h vence na segunda às 09:00', () => {
    expect(dueDate(at('2026-10-02T17:00:00'), 2, FORTALEZA)).toEqual(at('2026-10-05T09:00:00'));
  });

  it('aberta no sábado com SLA de 1 h vence na segunda às 09:00', () => {
    expect(dueDate(at('2026-10-03T10:00:00'), 1, FORTALEZA)).toEqual(at('2026-10-05T09:00:00'));
  });

  it('aberta depois das 18:00 começa a contar no expediente seguinte', () => {
    expect(dueDate(at('2026-10-05T19:30:00'), 1, FORTALEZA)).toEqual(at('2026-10-06T09:00:00'));
  });

  it('24 h úteis são 2 dias de expediente e mais 4 h', () => {
    expect(dueDate(at('2026-10-05T08:00:00'), 24, FORTALEZA)).toEqual(at('2026-10-07T12:00:00'));
  });

  it('o expediente segue o fuso, inclusive depois de uma mudança de horário', () => {
    // Aberta na sexta às 18:30 (UTC-5). Nova York adianta o relógio no domingo, 08/03/2026:
    // na segunda, 08:00 já é UTC-4.
    expect(dueDate(new Date('2026-03-06T23:30:00Z'), 1, 'America/New_York')).toEqual(
      new Date('2026-03-09T13:00:00Z'),
    );
  });
});

describe('Horas úteis entre dois instantes (tempos do painel)', () => {
  const at = (local: string) => new Date(`${local}-03:00`);

  it('no mesmo dia de expediente, conta as horas corridas', () => {
    expect(
      businessHoursBetween(at('2026-10-05T09:00:00'), at('2026-10-05T11:30:00'), FORTALEZA),
    ).toBe(2.5);
  });

  it('da sexta às 17:00 à segunda às 09:00 são 2 h, não 64 h', () => {
    expect(
      businessHoursBetween(at('2026-10-02T17:00:00'), at('2026-10-05T09:00:00'), FORTALEZA),
    ).toBe(2);
  });

  it('fora do expediente não conta nada', () => {
    expect(
      businessHoursBetween(at('2026-10-05T19:00:00'), at('2026-10-06T07:00:00'), FORTALEZA),
    ).toBe(0);
  });

  it('é o inverso do prazo: do instante de abertura ao prazo há o SLA inteiro', () => {
    const openedAt = at('2026-10-02T15:20:00');
    expect(businessHoursBetween(openedAt, dueDate(openedAt, 24, FORTALEZA), FORTALEZA)).toBe(24);
  });
});

describe('Período do filtro (dia no fuso da empresa → UTC)', () => {
  it('um dia de Fortaleza vai das 03:00 UTC às 03:00 UTC do dia seguinte', () => {
    expect(periodToUtcRange(FORTALEZA, '2026-10-01', '2026-10-01')).toEqual({
      gte: new Date('2026-10-01T03:00:00Z'),
      lt: new Date('2026-10-02T03:00:00Z'),
    });
  });

  it('o último dia entra inteiro, inclusive na virada do mês', () => {
    expect(periodToUtcRange(FORTALEZA, '2026-09-29', '2026-09-30')).toEqual({
      gte: new Date('2026-09-29T03:00:00Z'),
      lt: new Date('2026-10-01T03:00:00Z'),
    });
  });

  it('aceita só uma das pontas ou nenhuma', () => {
    expect(periodToUtcRange(FORTALEZA, '2026-10-01', undefined)).toEqual({
      gte: new Date('2026-10-01T03:00:00Z'),
      lt: undefined,
    });
    expect(periodToUtcRange(FORTALEZA, undefined, '2026-10-01')).toEqual({
      gte: undefined,
      lt: new Date('2026-10-02T03:00:00Z'),
    });
    expect(periodToUtcRange(FORTALEZA)).toEqual({ gte: undefined, lt: undefined });
  });

  it('usa o fuso informado: em Tóquio (UTC+9) o dia começa às 15:00 UTC da véspera', () => {
    expect(periodToUtcRange('Asia/Tokyo', '2026-10-01', '2026-10-01')).toEqual({
      gte: new Date('2026-09-30T15:00:00Z'),
      lt: new Date('2026-10-01T15:00:00Z'),
    });
  });

  it('acerta o dia de mudança de horário: em Sydney o 04/10/2026 tem 23 h', () => {
    // Sydney adianta o relógio às 02:00 desse domingo: o dia começa em UTC+10 e termina em UTC+11.
    expect(periodToUtcRange('Australia/Sydney', '2026-10-04', '2026-10-04')).toEqual({
      gte: new Date('2026-10-03T14:00:00Z'),
      lt: new Date('2026-10-04T13:00:00Z'),
    });
  });
});
