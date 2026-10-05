import { TestBed } from '@angular/core/testing';
import { PoNotificationService } from '@po-ui/ng-components';
import { SessionTimer } from './session-timer';

const MINUTE = 60 * 1000;

describe('SessionTimer', () => {
  let timer: SessionTimer;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [{ provide: PoNotificationService, useValue: { warning: vi.fn() } }],
    });
    timer = TestBed.inject(SessionTimer);
  });

  afterEach(() => {
    timer.stop();
    vi.useRealTimers();
  });

  it('avisa 5 minutos antes do fim informado pela API', () => {
    timer.restart(15);

    vi.advanceTimersByTime(10 * MINUTE - 1);
    expect(timer.expiring()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(timer.expiring()).toBe(true);
    expect(timer.idleMinutes()).toBe(15);
  });

  it('cada resposta da API recomeça a contagem e retira o aviso', () => {
    timer.restart(15);
    vi.advanceTimersByTime(10 * MINUTE);
    expect(timer.expiring()).toBe(true);

    timer.restart(15);
    expect(timer.expiring()).toBe(false);
    vi.advanceTimersByTime(10 * MINUTE - 1);
    expect(timer.expiring()).toBe(false);
  });

  it('no fim do tempo sem resposta encerra a sessão também na tela', () => {
    const expire = vi.spyOn(timer, 'expire').mockImplementation(() => undefined);
    timer.restart(15);

    vi.advanceTimersByTime(15 * MINUTE - 1);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledOnce();
  });
});
