import { CacheService } from './cache.service';

describe('CacheService', () => {
  it('converte o contrato público de TTL em segundos para milissegundos', async () => {
    const cacheManager = {
      set: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CacheService(cacheManager as never, {} as never);

    await service.set('cache-key', { ok: true }, 60);

    expect(cacheManager.set).toHaveBeenCalledWith(
      'cache-key',
      { ok: true },
      60_000,
    );
  });

  it('libera lock distribuído somente com o token do proprietário', async () => {
    const cacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
      get: jest.fn(),
      del: jest.fn(),
    };
    const service = new CacheService(
      cacheManager as never,
      {
        getClient: () => redis,
      } as never,
    );

    await expect(
      service.getOrSet('t:tenant-1:dashboard:kpis', () =>
        Promise.resolve({
          total: 1,
        }),
      ),
    ).resolves.toEqual({ total: 1 });

    const setCalls = redis.set.mock.calls as Array<[string, string]>;
    const lockToken = setCalls[0][1];
    expect(lockToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('GET', KEYS[1])"),
      1,
      'lock:getOrSet:t:tenant-1:dashboard:kpis',
      lockToken,
    );
  });

  it('não usa GET/DEL não atômico quando a liberação Lua falha', async () => {
    const cacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockRejectedValue(new Error('redis unavailable')),
      get: jest.fn(),
      del: jest.fn(),
    };
    const service = new CacheService(
      cacheManager as never,
      { getClient: () => redis } as never,
    );

    await expect(
      service.getOrSet('t:tenant-1:dashboard:kpis', () =>
        Promise.resolve({ total: 1 }),
      ),
    ).resolves.toEqual({ total: 1 });

    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('exige companyId para chave tenant-scoped', () => {
    const service = new CacheService({} as never, {} as never);
    expect(() => service.tenantKey('', 'dashboard')).toThrow(
      'companyId é obrigatório',
    );
  });
});
