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

  it('sem os minutos da API, usa 30: avisa aos 25', () => {
    timer.restart();

    vi.advanceTimersByTime(25 * MINUTE - 1);
    expect(timer.expiring()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(timer.expiring()).toBe(true);
    expect(timer.idleMinutes()).toBe(30);
  });

  it('conta a partir do que falta segundo a API, não do tempo inteiro', () => {
    const expire = vi.spyOn(timer, 'expire').mockImplementation(() => undefined);
    // A API renova a sessão de minuto em minuto: aqui faltam 29 min, não 30.
    timer.restart(30, 29 * MINUTE);

    vi.advanceTimersByTime(24 * MINUTE);
    expect(timer.expiring()).toBe(true);
    vi.advanceTimersByTime(5 * MINUTE);
    expect(expire).toHaveBeenCalledOnce();
  });

  it('com sessão curta, avisa na metade do tempo, e não logo depois de cada resposta', () => {
    timer.restart(5);

    vi.advanceTimersByTime(2.5 * MINUTE - 1);
    expect(timer.expiring()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(timer.expiring()).toBe(true);
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

  it('sem sessão não avisa', () => {
    timer.restart();
    timer.stop();

    vi.advanceTimersByTime(30 * MINUTE);
    expect(timer.expiring()).toBe(false);
  });
});
