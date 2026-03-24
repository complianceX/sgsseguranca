import {
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  OpenAiCircuitBreakerService,
  OpenAiCircuitBreakerState,
} from './openai-circuit-breaker.service';

type Hash = Record<string, string>;

class RedisMock {
  private hashes = new Map<string, Hash>();
  private keys = new Map<string, { value: string; expiresAt?: number }>();
  private sortedSets = new Map<
    string,
    Array<{ score: number; member: string }>
  >();

  hgetall(key: string): Promise<Hash> {
    return Promise.resolve({ ...(this.hashes.get(key) || {}) });
  }

  hset(key: string, values: Record<string, string>): Promise<number> {
    const current = this.hashes.get(key) || {};
    this.hashes.set(key, { ...current, ...values });
    return Promise.resolve(1);
  }

  expire(_key: string, _seconds: number): Promise<number> {
    return Promise.resolve(1);
  }

  set(
    key: string,
    value: string,
    mode: 'PX',
    ttlMs: number,
    strategy: 'NX',
  ): Promise<'OK' | null> {
    if (mode !== 'PX' || strategy !== 'NX') {
      return Promise.resolve(null);
    }

    const now = Date.now();
    const current = this.keys.get(key);
    if (current?.expiresAt && current.expiresAt <= now) {
      this.keys.delete(key);
    }

    if (this.keys.has(key)) {
      return Promise.resolve(null);
    }

    this.keys.set(key, { value, expiresAt: now + ttlMs });
    return Promise.resolve('OK');
  }

  del(key: string): Promise<number> {
    const existed = this.keys.delete(key);
    return Promise.resolve(existed ? 1 : 0);
  }

  zadd(key: string, score: number, member: string): Promise<number> {
    const set = this.sortedSets.get(key) ?? [];
    const withoutMember = set.filter((entry) => entry.member !== member);
    withoutMember.push({ score, member });
    this.sortedSets.set(key, withoutMember);
    return Promise.resolve(1);
  }

  zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    const set = this.sortedSets.get(key) ?? [];
    const filtered = set.filter(
      (entry) => !(entry.score >= min && entry.score <= max),
    );
    this.sortedSets.set(key, filtered);
    return Promise.resolve(set.length - filtered.length);
  }

  zcard(key: string): Promise<number> {
    return Promise.resolve((this.sortedSets.get(key) ?? []).length);
  }
}

class MetricsMock {
  recordOpenAiCircuitBreakerState = jest.fn();
  incrementOpenAiCircuitBreakerTrips = jest.fn();
}

describe('OpenAiCircuitBreakerService', () => {
  let redis: RedisMock;
  let metrics: MetricsMock;
  let service: OpenAiCircuitBreakerService;

  beforeEach(() => {
    jest.restoreAllMocks();
    redis = new RedisMock();
    metrics = new MetricsMock();
    service = new OpenAiCircuitBreakerService(redis as never, metrics as never);
  });

  it('deve abrir após 3 falhas e fechar com sucesso em half-open', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);

    await service.recordFailure({
      error: new GatewayTimeoutException('timeout'),
    });
    await service.recordFailure({ status: 500 });
    await service.recordFailure({ status: 503 });

    expect(await service.getState()).toBe(OpenAiCircuitBreakerState.OPEN);
    expect(metrics.incrementOpenAiCircuitBreakerTrips).toHaveBeenCalledTimes(1);

    await expect(service.assertRequestAllowed()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    nowSpy.mockReturnValue(32_500);
    await expect(service.assertRequestAllowed()).resolves.toBeUndefined();
    expect(await service.getState()).toBe(OpenAiCircuitBreakerState.HALF_OPEN);

    await service.recordSuccess();
    expect(await service.getState()).toBe(OpenAiCircuitBreakerState.CLOSED);
  });

  it('deve voltar para OPEN quando teste HALF_OPEN falha', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(2_000);

    await service.recordFailure({ status: 500 });
    await service.recordFailure({ status: 502 });
    await service.recordFailure({ error: new Error('ECONNRESET') });

    expect(await service.getState()).toBe(OpenAiCircuitBreakerState.OPEN);

    nowSpy.mockReturnValue(33_500);
    await service.assertRequestAllowed();
    expect(await service.getState()).toBe(OpenAiCircuitBreakerState.HALF_OPEN);

    await service.recordFailure({ error: new Error('ECONNREFUSED') });
    expect(await service.getState()).toBe(OpenAiCircuitBreakerState.OPEN);
    expect(metrics.incrementOpenAiCircuitBreakerTrips).toHaveBeenCalledTimes(2);
  });
});
