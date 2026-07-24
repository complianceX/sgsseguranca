import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { PrivilegedDbService } from './privileged-db.service';

jest.mock('pg');

const mockClient = { query: jest.fn(), release: jest.fn() };
const mockPool = { connect: jest.fn(), on: jest.fn(), end: jest.fn() };

function makeConfig(values: Record<string, unknown>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe('PrivilegedDbService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Pool as unknown as jest.Mock).mockImplementation(() => mockPool);
    mockPool.connect.mockResolvedValue(mockClient);
    mockPool.end.mockResolvedValue(undefined);
  });

  it('fica dormente e nao cria pool sem DATABASE_ADMIN_URL', async () => {
    const svc = new PrivilegedDbService(makeConfig({}));
    expect(svc.isEnabled()).toBe(false);
    await expect(
      svc.withPrivilegedClient(() => Promise.resolve(1)),
    ).rejects.toThrow(/DATABASE_ADMIN_URL/);
    expect(Pool as unknown as jest.Mock).not.toHaveBeenCalled();
  });

  it('habilita, aplica statement_timeout e executa com client', async () => {
    const svc = new PrivilegedDbService(
      makeConfig({
        DATABASE_ADMIN_URL: 'postgresql://sgs_admin:x@host/db?sslmode=require',
      }),
    );
    expect(svc.isEnabled()).toBe(true);

    const result = await svc.withPrivilegedClient(async (client) => {
      await client.query('SELECT 1');
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(mockPool.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith(
      "SET statement_timeout = '30000'",
    );
    expect(mockClient.query).toHaveBeenCalledWith('SELECT 1');
    expect(mockClient.release).toHaveBeenCalledTimes(1);

    await svc.onModuleDestroy();
    expect(mockPool.end).toHaveBeenCalledTimes(1);
  });

  it('libera o client mesmo quando a operacao falha', async () => {
    const svc = new PrivilegedDbService(
      makeConfig({ DATABASE_ADMIN_URL: 'postgresql://sgs_admin:x@host/db' }),
    );
    await expect(
      svc.withPrivilegedClient(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('reutiliza o mesmo pool entre chamadas', async () => {
    const svc = new PrivilegedDbService(
      makeConfig({ DATABASE_ADMIN_URL: 'postgresql://sgs_admin:x@host/db' }),
    );
    await svc.withPrivilegedClient(() => Promise.resolve(1));
    await svc.withPrivilegedClient(() => Promise.resolve(2));
    expect(Pool as unknown as jest.Mock).toHaveBeenCalledTimes(1);
  });
});
