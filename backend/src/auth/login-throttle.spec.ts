import { HttpException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { LoginThrottle } from './login-throttle.js';

const NOW = new Date('2026-10-01T12:00:00Z');
const ONE_MINUTE_AGO = new Date(NOW.getTime() - 60_000);

describe('LoginThrottle', () => {
  const loginFailure = {
    count: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  };
  let throttle: LoginThrottle;

  // Linhas no último minuto, já contando a desta tentativa: do mesmo usuário+IP e do IP
  // somando todos os usuários.
  function rowsInDatabase(perAccount: number, perIp: number) {
    loginFailure.count.mockImplementation(({ where }: { where: { username?: string } }) =>
      Promise.resolve(where.username ? perAccount : perIp),
    );
  }

  const blocked = async () => {
    try {
      await throttle.begin('10.0.0.1', 'ana');
      return false;
    } catch (error) {
      return error instanceof HttpException && error.getStatus() === 429;
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.resetAllMocks();
    loginFailure.create.mockResolvedValue({ id: 42 });
    throttle = new LoginThrottle({ loginFailure } as unknown as PrismaService);
  });

  afterEach(() => vi.useRealTimers());

  it('bloqueia a 6ª tentativa com 5 erros do mesmo usuário no mesmo IP', async () => {
    rowsInDatabase(6, 6);

    expect(await blocked()).toBe(true);
  });

  it('bloqueia a 21ª tentativa do mesmo IP somando vários usuários', async () => {
    rowsInDatabase(1, 21);

    expect(await blocked()).toBe(true);
  });

  it('libera até os dois limites', async () => {
    rowsInDatabase(5, 20);

    expect(await blocked()).toBe(false);
  });

  it('grava a tentativa antes de contar, com o instante da API', async () => {
    const order: string[] = [];
    loginFailure.create.mockImplementation(() => {
      order.push('create');
      return Promise.resolve({ id: 42 });
    });
    loginFailure.count.mockImplementation(() => {
      order.push('count');
      return Promise.resolve(1);
    });

    await expect(throttle.begin('10.0.0.1', 'ana')).resolves.toBe(42);

    expect(loginFailure.create).toHaveBeenCalledWith({
      data: { ip: '10.0.0.1', username: 'ana', failedAt: NOW },
    });
    expect(order).toEqual(['create', 'count', 'count']);
  });

  it('a tentativa recusada não fica contando como erro', async () => {
    rowsInDatabase(6, 6);

    await blocked();

    expect(loginFailure.deleteMany).toHaveBeenCalledWith({ where: { id: 42 } });
  });

  it('conta só o último minuto, e apaga antes os erros mais velhos', async () => {
    rowsInDatabase(1, 1);

    await throttle.begin('10.0.0.1', 'ana');

    expect(loginFailure.deleteMany).toHaveBeenCalledWith({
      where: { failedAt: { lte: ONE_MINUTE_AGO } },
    });
    expect(loginFailure.count).toHaveBeenCalledWith({
      where: { ip: '10.0.0.1', username: 'ana', failedAt: { gt: ONE_MINUTE_AGO } },
    });
    expect(loginFailure.count).toHaveBeenCalledWith({
      where: { ip: '10.0.0.1', failedAt: { gt: ONE_MINUTE_AGO } },
    });
  });

  it('um acerto apaga os erros daquele usuário naquele IP, e só eles', async () => {
    await throttle.succeed('10.0.0.1', 'ana');

    expect(loginFailure.deleteMany).toHaveBeenCalledWith({
      where: { ip: '10.0.0.1', username: 'ana' },
    });
  });
});
