import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { hashToken, SessionService } from './session.service.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = new Date('2026-10-01T12:00:00Z');

const user = { id: 7, name: 'Ana Souza', username: 'ana', role: 'REQUESTER' as const };

describe('SessionService', () => {
  const session = {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  };
  const config = {
    get: (key: string) => ({ SESSION_IDLE_MINUTES: 30, SESSION_ABSOLUTE_HOURS: 8 })[key],
  };
  let service: SessionService;

  function storedSession(lastSeenAgoMs: number, expiresInMs: number) {
    return {
      id: 1,
      lastSeenAt: new Date(NOW.getTime() - lastSeenAgoMs),
      expiresAt: new Date(NOW.getTime() + expiresInMs),
      user: { ...user, passwordHash: 'hash', createdAt: NOW },
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.resetAllMocks();
    service = new SessionService(
      { session } as unknown as PrismaService,
      config as unknown as ConfigService<Env, true>,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cria a sessão guardando só o hash do token, com limite absoluto de 8 h', async () => {
    const token = await service.create(user.id);

    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(session.create).toHaveBeenCalledWith({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        lastSeenAt: NOW,
        expiresAt: new Date(NOW.getTime() + 8 * HOUR),
      },
    });
  });

  it('devolve o usuário de uma sessão válida, sem expor o hash da senha', async () => {
    session.findUnique.mockResolvedValue(storedSession(10_000, HOUR));

    await expect(service.validate('token')).resolves.toEqual(user);
    expect(session.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('token') },
      include: { user: true },
    });
    expect(session.update).not.toHaveBeenCalled();
  });

  it('renova last_seen_at quando o último uso foi há mais de um minuto', async () => {
    session.findUnique.mockResolvedValue(storedSession(5 * MINUTE, HOUR));

    await service.validate('token');

    expect(session.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { lastSeenAt: NOW } });
  });

  it('recusa um token desconhecido', async () => {
    session.findUnique.mockResolvedValue(null);

    await expect(service.validate('token')).resolves.toBeNull();
  });

  it('expira e apaga a sessão após 30 min de inatividade', async () => {
    session.findUnique.mockResolvedValue(storedSession(30 * MINUTE, HOUR));

    await expect(service.validate('token')).resolves.toBeNull();
    expect(session.deleteMany).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('expira e apaga a sessão no limite absoluto, mesmo em uso', async () => {
    session.findUnique.mockResolvedValue(storedSession(1_000, 0));

    await expect(service.validate('token')).resolves.toBeNull();
    expect(session.deleteMany).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('revoga a sessão pelo hash do token', async () => {
    await service.revoke('token');

    expect(session.deleteMany).toHaveBeenCalledWith({ where: { tokenHash: hashToken('token') } });
  });
});
