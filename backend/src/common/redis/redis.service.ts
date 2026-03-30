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
    value: string = '1',
  ): Promise<void> {
    const key = this.getRefreshTokenKey(userId, tokenHash);
    const setKey = this.getRefreshTokenSetKey(userId);

    await this.client
      .multi()
      .setex(key, ttlSeconds, value)
      .sadd(setKey, tokenHash)
      .expire(setKey, ttlSeconds)
      .exec();
  }

  async revokeRefreshToken(userId: string, tokenHash: string): Promise<void> {
    const key = this.getRefreshTokenKey(userId, tokenHash);
    const setKey = this.getRefreshTokenSetKey(userId);

    await this.client.multi().del(key).srem(setKey, tokenHash).exec();
  }

  private getConsumedTokenKey(userId: string, tokenHash: string): string {
    return `consumed:${userId}:${tokenHash}`;
  }

  /**
   * Checks if a token hash was already consumed (rotated). A hit means
   * someone is replaying an old refresh token — possible session hijacking.
   */
  async isTokenConsumed(userId: string, tokenHash: string): Promise<boolean> {
    const key = this.getConsumedTokenKey(userId, tokenHash);
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Consome atomicamente um refresh token antigo via Lua script.
   *
   * Elimina a janela TOCTOU do padrão GET → lógica → DEL:
   * GET e DEL acontecem na mesma execução Lua, indivisível no Redis.
   * Se duas requisições concorrentes chegarem com o mesmo token,
   * apenas uma receberá o valor de volta — a outra receberá null.
   *
   * Após consumo bem-sucedido, armazena um "tombstone" por 7 dias.
   * Se o mesmo token for apresentado novamente (replay), o tombstone
   * permite detectar reuse e disparar revogação total (session hijacking).
   *
   * Retorna o valor armazenado (ex.: '1' ou JSON com ua hash),
   * ou null se o token não existir / já tiver sido consumido.
   */
  async atomicConsumeRefreshToken(
    userId: string,
    tokenHash: string,
  ): Promise<string | null> {
    const key = this.getRefreshTokenKey(userId, tokenHash);
    const setKey = this.getRefreshTokenSetKey(userId);
    const consumedKey = this.getConsumedTokenKey(userId, tokenHash);
    const tombstoneTtl = 7 * 24 * 3600; // 7 days

    // Lua: GET + DEL + SREM + SET tombstone em uma única operação atômica.
    const script = `
      local val = redis.call('GET', KEYS[1])
      if val == false then
        return false
      end
      redis.call('DEL', KEYS[1])
      redis.call('SREM', KEYS[2], ARGV[1])
      redis.call('SETEX', KEYS[3], ARGV[2], '1')
      return val
    `;

    const result = await this.client.eval(
      script,
      3,
      key,
      setKey,
      consumedKey,
      tokenHash,
      String(tombstoneTtl),
    );
    return typeof result === 'string' ? result : null;
  }

  async rotateRefreshToken(
    userId: string,
    oldTokenHash: string,
    newTokenHash: string,
    ttlSeconds: number,
    value: string = '1',
  ): Promise<void> {
    const oldKey = this.getRefreshTokenKey(userId, oldTokenHash);
    const newKey = this.getRefreshTokenKey(userId, newTokenHash);
    const setKey = this.getRefreshTokenSetKey(userId);

    await this.client
      .multi()
      .del(oldKey)
      .srem(setKey, oldTokenHash)
      .setex(newKey, ttlSeconds, value)
      .sadd(setKey, newTokenHash)
      .expire(setKey, ttlSeconds)
      .exec();
  }

  async clearAllSessions(userId: string): Promise<void> {
    await this.deleteByPattern(`session:${userId}:*`);
  }

  /**
   * Enforces max active sessions per user by evicting the oldest tokens
   * when the limit is exceeded. Returns the list of evicted token hashes.
   *
   * Otimizado com pipeline: todas as chamadas TTL são agrupadas em um único
   * round-trip ao Redis (antes: N round-trips sequenciais por sessão).
   * Evicções também são agrupadas em um único pipeline.
   */
  async enforceMaxSessions(
    userId: string,
    maxSessions: number,
  ): Promise<string[]> {
    if (!Number.isFinite(maxSessions) || maxSessions <= 0) {
      return [];
    }

    const setKey = this.getRefreshTokenSetKey(userId);
    const currentCount = await this.client.scard(setKey);
    if (currentCount <= maxSessions) {
      return [];
    }

    const allHashes = await this.client.smembers(setKey);

    if (allHashes.length <= maxSessions) {
      return [];
    }

    // Fase 1: busca TTL de todos os tokens em um único round-trip via pipeline.
    const pipeline = this.client.pipeline();
    for (const hash of allHashes) {
      pipeline.ttl(this.getRefreshTokenKey(userId, hash));
    }
    const ttlResults = await pipeline.exec();

    // Fase 2: classifica tokens vivos vs expirados.
    const hashesWithTtl: Array<{ hash: string; ttl: number }> = [];
    const expiredHashes: string[] = [];

    for (let i = 0; i < allHashes.length; i++) {
      const result = ttlResults?.[i];
      const ttl = result && !result[0] ? (result[1] as number) : -2;
      if (ttl > 0) {
        hashesWithTtl.push({ hash: allHashes[i], ttl });
      } else {
        expiredHashes.push(allHashes[i]);
      }
    }

    // Limpa tokens expirados do set em uma única operação.
    if (expiredHashes.length) {
      await this.client.srem(setKey, ...expiredHashes);
    }

    if (hashesWithTtl.length <= maxSessions) {
      return [];
    }

    // Sort by TTL ascending (lowest TTL = oldest session) and evict excess
    hashesWithTtl.sort((a, b) => a.ttl - b.ttl);
    const toEvict = hashesWithTtl.slice(0, hashesWithTtl.length - maxSessions);

    // Fase 3: evicção em um único pipeline — sem round-trips por token.
    const evictPipeline = this.client.pipeline();
    for (const { hash } of toEvict) {
      const key = this.getRefreshTokenKey(userId, hash);
      evictPipeline.del(key);
      evictPipeline.srem(setKey, hash);
    }
    await evictPipeline.exec();

    return toEvict.map(({ hash }) => hash);
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
