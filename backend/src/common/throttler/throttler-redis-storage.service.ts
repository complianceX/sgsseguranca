import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type { Redis } from 'ioredis';

/**
 * ThrottlerStorage implementado sobre Redis.
 *
 * Substitui o storage em memória padrão do @nestjs/throttler para que
 * os rate limits por IP funcionem corretamente em múltiplas instâncias
 * do backend (horizontal scaling / Railway multi-replica).
 *
 * Usa Lua script para reduzir round-trips e garantir atomicidade.
 * Suporta bloqueio (blockDuration) além do simples throttle.
 */
export class ThrottlerRedisStorageService implements ThrottlerStorage {
  private readonly incrementScript = `
    local hitKey = KEYS[1]
    local blockKey = KEYS[2]
    local ttlMs = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local blockDurationMs = tonumber(ARGV[3])

    local blockTtlMs = redis.call('PTTL', blockKey)
    if blockTtlMs > 0 then
      local existingHits = tonumber(redis.call('GET', hitKey) or '0')
      return {existingHits, 0, 1, blockTtlMs}
    end

    local totalHits = redis.call('INCR', hitKey)
    if totalHits == 1 then
      redis.call('PEXPIRE', hitKey, ttlMs)
    end

    local remainingTtlMs = redis.call('PTTL', hitKey)
    if totalHits > limit and blockDurationMs > 0 then
      redis.call('SET', blockKey, '1', 'PX', blockDurationMs)
      return {totalHits, 0, 1, blockDurationMs}
    end

    return {totalHits, remainingTtlMs, 0, 0}
  `;

  private readonly failOpenOnError: boolean;
  private readonly redisDecisionTimeoutMs: number;

  constructor(private readonly redis: Redis) {
    this.failOpenOnError = this.resolveFailOpenOnError();
    this.redisDecisionTimeoutMs = this.resolveRedisDecisionTimeoutMs();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `throttler:hit:${throttlerName}:${key}`;
    const blockKey = `throttler:block:${throttlerName}:${key}`;

    try {
      const rawResult = await this.withDecisionTimeout(
        this.redis.eval(
          this.incrementScript,
          2,
          hitKey,
          blockKey,
          String(ttl),
          String(limit),
          String(blockDuration),
        ) as Promise<[number | string, number | string, number | string, number | string]>,
      );

      if (!Array.isArray(rawResult) || rawResult.length !== 4) {
        // If Redis returns an unexpected type, treating it as "allow all" is dangerous.
        // Fail closed by surfacing an error so the guard can apply strict fallback/503.
        throw new Error('throttler_storage_invalid_redis_eval_result');
      }

      const [rawTotalHits, rawTtlMs, rawIsBlocked, rawBlockTtlMs] = rawResult;

      const totalHits = this.toSafeInt(rawTotalHits, 0);
      const ttlMs = this.toSafeInt(rawTtlMs, ttl);
      const isBlocked = this.toSafeInt(rawIsBlocked, 0) === 1;
      const blockTtlMs = this.toSafeInt(rawBlockTtlMs, blockDuration);

      if (isBlocked) {
        return {
          totalHits,
          timeToExpire: 0,
          isBlocked: true,
          timeToBlockExpire: Math.max(0, Math.ceil(blockTtlMs / 1000)),
        };
      }
      return {
        totalHits,
        timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    } catch (error) {
      if (!this.failOpenOnError) {
        throw error;
      }

      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }

  private resolveFailOpenOnError(): boolean {
    // SECURITY: never allow "fail-open" semantics in production for throttling.
    if (process.env.NODE_ENV === 'production') {
      return false;
    }

    const raw = process.env.THROTTLER_STORAGE_FAIL_OPEN?.trim().toLowerCase();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return process.env.NODE_ENV !== 'production';
  }

  private resolveRedisDecisionTimeoutMs(): number {
    const raw = Number(process.env.THROTTLER_STORAGE_REDIS_TIMEOUT_MS || 200);
    if (!Number.isFinite(raw) || raw <= 0) {
      return 200;
    }
    return Math.min(Math.max(Math.floor(raw), 25), 5000);
  }

  private toSafeInt(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private async withDecisionTimeout<T>(operation: Promise<T>): Promise<T> {
    const timeoutMs = this.redisDecisionTimeoutMs;
    if (timeoutMs <= 0) {
      return operation;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`throttler_storage_timeout_after_${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
