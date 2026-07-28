import {
  BadRequestException,
  Injectable,
  Inject,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { randomUUID } from 'node:crypto';
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
const USER_PROFILE_CACHE_TTL_SECONDS = 5 * 60;
const COMPANY_CACHE_TTL_SECONDS = 15 * 60;

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
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.cacheManager.set(
      key,
      value,
      this.toCacheManagerTtlMs(ttlSeconds),
    );
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
    ttlSeconds?: number,
  ): Promise<T> {
    // 1. Cache hit — caminho feliz, sem lock necessário
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const redis = this.redisService.getClient();
    const lockKey = `lock:getOrSet:${key}`;
    const lockToken = randomUUID();

    // 2. Tentar adquirir lock (SET NX PX = atômico, sem race condition)
    const acquired = await redis.set(
      lockKey,
      lockToken,
      'PX',
      GET_OR_SET_LOCK_TTL_MS,
      'NX',
    );

    if (acquired === 'OK') {
      // 3. Somos o único a executar a factory
      try {
        const value = await factory();
        await this.set(key, value, ttlSeconds);
        return value;
      } catch (err) {
        this.logger.error(
          `getOrSet factory falhou para key="${key}": ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      } finally {
        await this.releaseDistributedLock(redis, lockKey, lockToken);
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
        return this.getOrSet(key, factory, ttlSeconds);
      }
    }

    // 5. Fallback: polling esgotou — executar factory diretamente
    // Prefere duplicar trabalho a bloquear a requisição do usuário
    this.logger.warn(
      `getOrSet polling esgotou para key="${key}" — executando factory como fallback`,
    );
    return factory();
  }

  private toCacheManagerTtlMs(ttlSeconds?: number): number | undefined {
    if (ttlSeconds === undefined) {
      return undefined;
    }
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new BadRequestException(
        'TTL do cache deve ser um número positivo em segundos.',
      );
    }
    return Math.floor(ttlSeconds * 1000);
  }

  private async releaseDistributedLock(
    redis: ReturnType<RedisService['getClient']>,
    lockKey: string,
    lockToken: string,
  ): Promise<void> {
    const releaseScript = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      end
      return 0
    `;

    try {
      await redis.eval(releaseScript, 1, lockKey, lockToken);
    } catch {
      // Nunca usar GET seguido de DEL como fallback: entre as duas operações o
      // lock pode expirar e ser adquirido por outro processo. O TTL garante a
      // liberação eventual sem remover o lock de outro proprietário.
    }
  }

  /**
   * Invalidate cache by pattern (requires Redis)
   */
  async invalidatePattern(pattern: string): Promise<void> {
    await this.redisService.deleteByPattern(pattern);
  }

  /**
   * Constrói uma chave de cache com escopo de tenant (defesa em profundidade).
   *
   * Caches de dados específicos de tenant DEVEM usar este helper para evitar
   * vazamento cross-tenant por colisão de chave entre empresas. O prefixo `t:`
   * + companyId garante namespacing por tenant e permite invalidação em massa
   * via `invalidatePattern('t:<companyId>:*')`.
   *
   * Ex.: cache.tenantKey('comp-1', 'dashboard', 'kpis') → 't:comp-1:dashboard:kpis'
   */
  tenantKey(companyId: string, ...parts: Array<string | number>): string {
    if (!companyId) {
      throw new BadRequestException(
        'CacheService.tenantKey: companyId é obrigatório para chave com escopo de tenant.',
      );
    }
    return ['t', companyId, ...parts].join(':');
  }

  /**
   * Cache user profile
   */
  async cacheUserProfile<T>(
    companyId: string,
    userId: string,
    profile: T,
  ): Promise<void> {
    await this.set(
      this.tenantKey(companyId, 'user', 'profile', userId),
      profile,
      USER_PROFILE_CACHE_TTL_SECONDS,
    );
  }

  /**
   * Get cached user profile
   */
  async getUserProfile<T>(
    companyId: string,
    userId: string,
  ): Promise<T | undefined> {
    return this.get<T>(this.tenantKey(companyId, 'user', 'profile', userId));
  }

  /**
   * Invalidate user cache
   */
  async invalidateUserCache(companyId: string, userId: string): Promise<void> {
    await this.del(this.tenantKey(companyId, 'user', 'profile', userId));
    await this.invalidatePattern(
      this.tenantKey(companyId, 'user', '*', userId, '*'),
    );
  }

  /**
   * Cache company data
   */
  async cacheCompany<T>(companyId: string, company: T): Promise<void> {
    await this.set(`company:${companyId}`, company, COMPANY_CACHE_TTL_SECONDS);
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
