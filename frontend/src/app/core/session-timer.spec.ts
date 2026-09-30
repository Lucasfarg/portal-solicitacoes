import { TestBed } from '@angular/core/testing';
import { SessionTimer, WARN_AFTER_MS } from './session-timer';

describe('SessionTimer', () => {
  let timer: SessionTimer;

  beforeEach(() => {
    vi.useFakeTimers();
    timer = TestBed.inject(SessionTimer);
  });

  afterEach(() => {
    timer.stop();
    vi.useRealTimers();
  });

  it('avisa depois de 25 minutos sem resposta da API', () => {
    timer.restart();

    vi.advanceTimersByTime(WARN_AFTER_MS - 1);
    expect(timer.expiring()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(timer.expiring()).toBe(true);
  });

  it('cada resposta da API recomeça a contagem e retira o aviso', () => {
    timer.restart();
    vi.advanceTimersByTime(WARN_AFTER_MS);
    expect(timer.expiring()).toBe(true);

    timer.restart();
    expect(timer.expiring()).toBe(false);
    vi.advanceTimersByTime(WARN_AFTER_MS - 1);
    expect(timer.expiring()).toBe(false);
  });

  it('sem sessão não avisa', () => {
    timer.restart();
    timer.stop();

    vi.advanceTimersByTime(WARN_AFTER_MS);
    expect(timer.expiring()).toBe(false);
  });
});
