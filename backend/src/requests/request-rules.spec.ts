import { ConflictException, ForbiddenException } from '@nestjs/common';
import { REQUEST_STATUSES, type RequestStatus } from '@portal/shared';
import {
  assertCanChangeStatus,
  assertCanModify,
  assertCanView,
  canView,
  dueDate,
  periodToUtcRange,
  visibleTo,
} from './request-rules.js';

const ana = { id: 1, name: 'Ana Souza', username: 'ana', role: 'REQUESTER' as const };
const bruno = { id: 2, name: 'Bruno Lima', username: 'bruno', role: 'REQUESTER' as const };
const carla = { id: 3, name: 'Carla Mendes', username: 'carla', role: 'AGENT' as const };

const requestOfAna = (status: RequestStatus = 'OPEN') => ({ requesterId: ana.id, status });

describe('Permissões', () => {
  describe('ver', () => {
    it('o dono vê a própria solicitação', () => {
      expect(canView(ana, requestOfAna())).toBe(true);
    });

    it('outro colaborador não vê', () => {
      expect(canView(bruno, requestOfAna())).toBe(false);
      expect(() => assertCanView(bruno, requestOfAna())).toThrow(ForbiddenException);
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

    it('outro colaborador não pode (403)', () => {
      expect(() => assertCanModify(bruno, requestOfAna())).toThrow(ForbiddenException);
    });

    it('o atendente não pode, porque não é o dono (403)', () => {
      expect(() => assertCanModify(carla, requestOfAna())).toThrow(ForbiddenException);
    });

    it('quem não é dono recebe 403 mesmo se a solicitação já saiu de Aberto', () => {
      expect(() => assertCanModify(bruno, requestOfAna('DONE'))).toThrow(ForbiddenException);
    });
  });
});

describe('Transições de status', () => {
  const VALID = ['OPEN>IN_PROGRESS', 'IN_PROGRESS>DONE'];

  // Todas as 9 combinações de origem e destino: só as duas de VALID passam.
  const pairs = REQUEST_STATUSES.flatMap((from) => REQUEST_STATUSES.map((to) => ({ from, to })));

  it.each(pairs)('atendente: $from → $to', ({ from, to }) => {
    const attempt = () => assertCanChangeStatus(carla, from, to);

    if (VALID.includes(`${from}>${to}`)) {
      expect(attempt).not.toThrow();
    } else {
      expect(attempt).toThrow(ConflictException);
    }
  });

  it('colaborador não muda status, nem o da própria solicitação (403)', () => {
    expect(() => assertCanChangeStatus(ana, 'OPEN', 'IN_PROGRESS')).toThrow(ForbiddenException);
  });

  it('a mensagem da transição inválida usa os rótulos da tela', () => {
    expect(() => assertCanChangeStatus(carla, 'DONE', 'OPEN')).toThrow(
      'Transição inválida: de "Concluído" não é possível ir para "Aberto"',
    );
  });
});

describe('Prazo (SLA)', () => {
  it('é a abertura mais as horas de SLA da categoria', () => {
    const openedAt = new Date('2026-10-01T12:00:00Z');

    expect(dueDate(openedAt, 24)).toEqual(new Date('2026-10-02T12:00:00Z'));
    expect(dueDate(openedAt, 120)).toEqual(new Date('2026-10-06T12:00:00Z'));
  });
});

describe('Período do filtro (America/Fortaleza → UTC)', () => {
  it('um dia de Fortaleza vai das 03:00 UTC às 03:00 UTC do dia seguinte', () => {
    expect(periodToUtcRange('2026-10-01', '2026-10-01')).toEqual({
      gte: new Date('2026-10-01T03:00:00Z'),
      lt: new Date('2026-10-02T03:00:00Z'),
    });
  });

  it('o último dia entra inteiro, inclusive na virada do mês', () => {
    expect(periodToUtcRange('2026-09-29', '2026-09-30')).toEqual({
      gte: new Date('2026-09-29T03:00:00Z'),
      lt: new Date('2026-10-01T03:00:00Z'),
    });
  });

  it('aceita só uma das pontas ou nenhuma', () => {
    expect(periodToUtcRange('2026-10-01', undefined)).toEqual({
      gte: new Date('2026-10-01T03:00:00Z'),
      lt: undefined,
    });
    expect(periodToUtcRange(undefined, '2026-10-01')).toEqual({
      gte: undefined,
      lt: new Date('2026-10-02T03:00:00Z'),
    });
    expect(periodToUtcRange()).toEqual({ gte: undefined, lt: undefined });
  });
});
