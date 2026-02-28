import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  getClient(): Redis {
    return this.client;
  }

  getRefreshTokenKey(userId: string, tokenHash: string): string {
    return `refresh:${userId}:${tokenHash}`;
  }

  getRefreshTokenSetKey(userId: string): string {
    return `refresh_set:${userId}`;
  }

  async storeRefreshToken(
    userId: string,
    tokenHash: string,
    ttlSeconds: number,
  ): Promise<void> {
    const key = this.getRefreshTokenKey(userId, tokenHash);
    const setKey = this.getRefreshTokenSetKey(userId);

    await this.client
      .multi()
      .setex(key, ttlSeconds, '1')
      .sadd(setKey, tokenHash)
      .expire(setKey, ttlSeconds)
      .exec();
  }

  async revokeRefreshToken(userId: string, tokenHash: string): Promise<void> {
    const key = this.getRefreshTokenKey(userId, tokenHash);
    const setKey = this.getRefreshTokenSetKey(userId);

    await this.client.multi().del(key).srem(setKey, tokenHash).exec();
  }

  async rotateRefreshToken(
    userId: string,
    oldTokenHash: string,
    newTokenHash: string,
    ttlSeconds: number,
  ): Promise<void> {
    const oldKey = this.getRefreshTokenKey(userId, oldTokenHash);
    const newKey = this.getRefreshTokenKey(userId, newTokenHash);
    const setKey = this.getRefreshTokenSetKey(userId);

    await this.client
      .multi()
      .del(oldKey)
      .srem(setKey, oldTokenHash)
      .setex(newKey, ttlSeconds, '1')
      .sadd(setKey, newTokenHash)
      .expire(setKey, ttlSeconds)
      .exec();
  }

  async clearAllSessions(userId: string): Promise<void> {
    await this.deleteByPattern(`session:${userId}:*`);
  }

  /** Invalida todos os refresh tokens de um usuário (ex: troca de senha). */
  async clearAllRefreshTokens(userId: string): Promise<void> {
    const setKey = this.getRefreshTokenSetKey(userId);

    // Prefer: usar o set por usuário (evita SCAN/KEYS).
    const setExists = await this.client.exists(setKey);
    if (setExists) {
      let cursor = '0';
      do {
        const [nextCursor, hashes] = await this.client.sscan(
          setKey,
          cursor,
          'COUNT',
          500,
        );
        cursor = nextCursor;

        if (hashes.length) {
          const keys = hashes.map((h) => this.getRefreshTokenKey(userId, h));
          await this.unlinkMany(keys);
        }
      } while (cursor !== '0');

      await this.client.del(setKey);
      return;
    }

    // Fallback: tokens antigos (antes do set) → SCAN por pattern.
    await this.deleteByPattern(`refresh:${userId}:*`);
  }

  async deleteByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        500,
      );
      cursor = nextCursor;

      if (keys.length) {
        await this.unlinkMany(keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');

    return deleted;
  }

  private async unlinkMany(keys: string[]): Promise<void> {
    const chunkSize = 500;
    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      if (!chunk.length) continue;
      await this.client.unlink(...chunk);
    }
  }
}
