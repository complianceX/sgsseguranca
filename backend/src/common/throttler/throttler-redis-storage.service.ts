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
 * Usa Lua script para garantir atomicidade do INCR + PEXPIRE.
 * Suporta bloqueio (blockDuration) além do simples throttle.
 */
export class ThrottlerRedisStorageService implements ThrottlerStorage {
  private readonly incrScript = `
    local c = redis.call('INCR', KEYS[1])
    if c == 1 then redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1])) end
    local ttl = redis.call('PTTL', KEYS[1])
    return {c, ttl}
  `;

  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `throttler:hit:${throttlerName}:${key}`;
    const blockKey = `throttler:block:${throttlerName}:${key}`;

    // Se já bloqueado, retornar estado de bloqueio sem incrementar
    const blockTtlMs = await this.redis.pttl(blockKey);
    if (blockTtlMs > 0) {
      const rawHits = await this.redis.get(hitKey);
      return {
        totalHits: parseInt(rawHits ?? '0', 10),
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockTtlMs / 1000),
      };
    }

    // Incrementar atomicamente e obter TTL restante
    const [totalHits, remainingTtlMs] = (await this.redis.eval(
      this.incrScript,
      1,
      hitKey,
      String(ttl),
    )) as [number, number];

    // Bloquear se limite excedido e blockDuration > 0
    if (totalHits > limit && blockDuration > 0) {
      await this.redis.set(blockKey, '1', 'PX', blockDuration);
      return {
        totalHits,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockDuration / 1000),
      };
    }

    return {
      totalHits,
      timeToExpire: Math.max(0, Math.ceil(remainingTtlMs / 1000)),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
