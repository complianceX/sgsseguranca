import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  function createService(options?: {
    ttlSeconds?: number;
    maxResponseBytes?: number;
    maxKeysPerScope?: number;
  }) {
    const storedValues: string[] = [];
    const redis = {
      set: jest.fn().mockImplementation((_key: string, value: string) => {
        storedValues.push(value);
        return Promise.resolve('OK');
      }),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
      decr: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(1),
    };
    const values: Record<string, number | undefined> = {
      IDEMPOTENCY_TTL_SECONDS: options?.ttlSeconds,
      IDEMPOTENCY_MAX_RESPONSE_BYTES: options?.maxResponseBytes,
      IDEMPOTENCY_MAX_KEYS_PER_SCOPE: options?.maxKeysPerScope,
    };
    const configService = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    return {
      redis,
      storedValues,
      service: new IdempotencyService(redis as never, configService),
    };
  }

  const quotaKey = (scopeId: string): string =>
    `idempotency:quota:${createHash('sha256').update(scopeId).digest('hex')}`;

  it('limita a quantidade de chaves por escopo e remove a excedente', async () => {
    const { redis, service } = createService({ maxKeysPerScope: 1 });
    redis.incr.mockResolvedValue(2);
    redis.del.mockResolvedValue(1);

    await expect(
      service.markProcessing(
        'tenant:t:user:u',
        'POST',
        '/reports',
        'key-2',
        'a'.repeat(64),
      ),
    ).resolves.toBe('quota_exceeded');
    expect(redis.del).toHaveBeenCalledWith(
      'idempotency:tenant:t:user:u:POST:/reports:key-2',
    );
    expect(redis.decr).toHaveBeenCalledWith(quotaKey('tenant:t:user:u'));
  });

  it('devolve a quota quando remove um registro ativo', async () => {
    const { redis, service } = createService();
    redis.del.mockResolvedValue(1);

    await service.deleteRecord('tenant:t:user:u', 'POST', '/reports', 'key-1');

    expect(redis.del).toHaveBeenCalledWith(
      'idempotency:tenant:t:user:u:POST:/reports:key-1',
    );
    expect(redis.decr).toHaveBeenCalledWith(quotaKey('tenant:t:user:u'));
  });

  it('não armazena corpo de resposta acima do limite configurado', async () => {
    const { redis, storedValues, service } = createService({
      maxResponseBytes: 1024,
    });

    await service.saveResponse(
      'tenant:t:user:u',
      'POST',
      '/reports',
      'key-1',
      'a'.repeat(64),
      201,
      { content: 'x'.repeat(2048) },
    );

    const serializedRecord: unknown = storedValues[0];
    expect(typeof serializedRecord).toBe('string');
    if (typeof serializedRecord !== 'string') {
      throw new Error('Registro idempotente não serializado.');
    }
    const record = JSON.parse(serializedRecord) as Record<string, unknown>;
    expect(record.responseStored).toBe(false);
    expect(record).not.toHaveProperty('body');
    expect(redis.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'EX',
      3600,
    );
  });

  it('descarta registros Redis inválidos ou do formato legado inseguro', async () => {
    const { redis, service } = createService();
    redis.get.mockResolvedValue(
      JSON.stringify({
        status: 'completed',
        body: { sensitive: true },
        createdAt: Date.now(),
      }),
    );

    await expect(
      service.getRecord('tenant:t:user:u', 'POST', '/reports', 'key-1'),
    ).resolves.toBeNull();
  });
});
