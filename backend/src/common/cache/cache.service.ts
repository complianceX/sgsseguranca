import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { RedisService } from '../redis/redis.service';

type ResettableCache = Cache & {
  clear?: () => Promise<void> | void;
  reset?: () => Promise<void> | void;
};

/**
 * TTL do lock distribuído para getOrSet.
 * Deve ser maior que o tempo máximo esperado da factory.
 * 30s é conservador — a maioria das queries de DB leva < 1s.
 */
const GET_OR_SET_LOCK_TTL_MS = 30_000;

/**
 * Intervalo de polling enquanto aguarda o lock ser liberado.
 * Evita busy-wait sem CPU excessiva.
 */
const GET_OR_SET_LOCK_POLL_MS = 50;

/**
 * Máximo de tentativas de polling antes de executar factory diretamente
 * (fallback seguro: prefere duplicar trabalho a bloquear a requisição).
 */
const GET_OR_SET_LOCK_MAX_ATTEMPTS = 60; // 60 × 50ms = 3s

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private redisService: RedisService,
  ) {}

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  /**
   * Set value in cache with TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  /**
   * Clear all cache
   */
  async reset(): Promise<void> {
    const resettableCache = this.cacheManager as ResettableCache;
    if (typeof resettableCache.clear === 'function') {
      await Promise.resolve(resettableCache.clear());
    } else if (typeof resettableCache.reset === 'function') {
      await Promise.resolve(resettableCache.reset());
    }
  }

  /**
   * Get or set com lock distribuído via Redis (SET NX PX).
   *
   * Problema resolvido: sem lock, múltiplas requisições simultâneas que
   * chegam com cache miss executam factory() em paralelo — causando N
   * queries ao banco de dados e spikes de CPU/latência (thundering herd).
   *
   * Solução:
   * 1. Tenta adquirir um lock Redis com NX + TTL de 30s
   * 2. Quem adquire executa factory(), armazena resultado e libera o lock
   * 3. Quem não adquire faz polling a cada 50ms até o cache ter valor
   * 4. Fallback: se o polling esgotar (3s), executa factory() diretamente
   *    — garante que a requisição nunca trava por causa do lock
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    // 1. Cache hit — caminho feliz, sem lock necessário
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const redis = this.redisService.getClient();
    const lockKey = `lock:getOrSet:${key}`;

    // 2. Tentar adquirir lock (SET NX PX = atômico, sem race condition)
    const acquired = await redis.set(
      lockKey,
      '1',
      'NX',
      'PX',
      GET_OR_SET_LOCK_TTL_MS,
    );

    if (acquired === 'OK') {
      // 3. Somos o único a executar a factory
      try {
        const value = await factory();
        await this.set(key, value, ttl);
        return value;
      } catch (err) {
        this.logger.error(
          `getOrSet factory falhou para key="${key}": ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      } finally {
        // Liberar lock sempre — mesmo em caso de erro
        await redis.del(lockKey).catch(() => undefined);
      }
    }

    // 4. Outro processo adquiriu o lock — aguardar via polling
    for (let i = 0; i < GET_OR_SET_LOCK_MAX_ATTEMPTS; i++) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, GET_OR_SET_LOCK_POLL_MS),
      );

      const polled = await this.get<T>(key);
      if (polled !== undefined) {
        return polled;
      }

      // Verificar se o lock ainda existe (pode ter expirado ou sido liberado)
      const lockExists = await redis.exists(lockKey);
      if (!lockExists) {
        // Lock sumiu mas cache ainda vazio — tentar novamente recursivamente
        // (evita loop infinito: a próxima chamada vai adquirir ou fazer polling)
        return this.getOrSet(key, factory, ttl);
      }
    }

    // 5. Fallback: polling esgotou — executar factory diretamente
    // Prefere duplicar trabalho a bloquear a requisição do usuário
    this.logger.warn(
      `getOrSet polling esgotou para key="${key}" — executando factory como fallback`,
    );
    return factory();
  }

  /**
   * Invalidate cache by pattern (requires Redis)
   */
  async invalidatePattern(pattern: string): Promise<void> {
    await this.redisService.deleteByPattern(pattern);
  }

  /**
   * Cache user profile
   */
  async cacheUserProfile<T>(userId: string, profile: T): Promise<void> {
    await this.set(`user:profile:${userId}`, profile, 300); // 5 min
  }

  /**
   * Get cached user profile
   */
  async getUserProfile<T>(userId: string): Promise<T | undefined> {
    return this.get<T>(`user:profile:${userId}`);
  }

  /**
   * Invalidate user cache
   */
  async invalidateUserCache(userId: string): Promise<void> {
    await this.del(`user:profile:${userId}`);
    await this.invalidatePattern(`user:${userId}:*`);
  }

  /**
   * Cache company data
   */
  async cacheCompany<T>(companyId: string, company: T): Promise<void> {
    await this.set(`company:${companyId}`, company, 900); // 15 min
  }

  /**
   * Get cached company
   */
  async getCompany<T>(companyId: string): Promise<T | undefined> {
    return this.get<T>(`company:${companyId}`);
  }

  /**
   * Invalidate company cache
   */
  async invalidateCompanyCache(companyId: string): Promise<void> {
    await this.del(`company:${companyId}`);
    await this.invalidatePattern(`company:${companyId}:*`);
  }
}
