import { ConflictException } from '@nestjs/common';
import { REQUEST_STATUSES } from '@portal/shared';
import {
  assertCanChangeStatus,
  businessHoursBetween,
  dueDate,
  periodToUtcRange,
} from './request-rules.js';

const FORTALEZA = 'America/Fortaleza';

// Fortaleza é UTC-3. 02/10/2026 é sexta; 05/10/2026, segunda.
const at = (local: string) => new Date(`${local}-03:00`);

describe('Transições de status', () => {
  const carla = { id: 3, name: 'Carla Mendes', username: 'carla', role: 'AGENT' as const };
  const VALID = ['OPEN>IN_PROGRESS', 'IN_PROGRESS>DONE'];

  const pairs = REQUEST_STATUSES.flatMap((from) => REQUEST_STATUSES.map((to) => ({ from, to })));

  it.each(pairs)('$from → $to', ({ from, to }) => {
    const request = { requesterId: 1, status: from, assigneeId: from === 'OPEN' ? null : carla.id };
    const attempt = () => assertCanChangeStatus(carla, request, to);

    if (VALID.includes(`${from}>${to}`)) {
      expect(attempt).not.toThrow();
    } else {
      expect(attempt).toThrow(ConflictException);
    }
  });
});

describe('Prazo em horas úteis (segunda a sexta, 08:00–18:00)', () => {
  it('dentro do expediente, soma as horas no mesmo dia', () => {
    expect(dueDate(at('2026-10-05T09:00:00'), 2, FORTALEZA)).toEqual(at('2026-10-05T11:00:00'));
  });

  it('aberta na sexta às 17:00 com prazo de 2 h vence na segunda às 09:00', () => {
    expect(dueDate(at('2026-10-02T17:00:00'), 2, FORTALEZA)).toEqual(at('2026-10-05T09:00:00'));
  });

  it('aberta depois das 18:00 começa a contar no expediente seguinte', () => {
    expect(dueDate(at('2026-10-05T19:30:00'), 1, FORTALEZA)).toEqual(at('2026-10-06T09:00:00'));
  });

  it('24 h úteis são 2 dias de expediente e mais 4 h', () => {
    expect(dueDate(at('2026-10-05T08:00:00'), 24, FORTALEZA)).toEqual(at('2026-10-07T12:00:00'));
  });
});

describe('Horas úteis entre dois instantes (tempos médios do painel)', () => {
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
});

describe('Período do filtro', () => {
  it('um dia de Fortaleza vai das 03:00 UTC às 03:00 UTC do dia seguinte', () => {
    expect(periodToUtcRange(FORTALEZA, '2026-10-01', '2026-10-01')).toEqual({
      gte: new Date('2026-10-01T03:00:00Z'),
      lt: new Date('2026-10-02T03:00:00Z'),
    });
  });
});
