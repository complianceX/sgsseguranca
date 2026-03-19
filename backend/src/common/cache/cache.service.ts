import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { RedisService } from '../redis/redis.service';

type ResettableCache = Cache & {
  clear?: () => Promise<void> | void;
  reset?: () => Promise<void> | void;
};

@Injectable()
export class CacheService {
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
   * Get or set pattern - fetch from cache or compute and cache
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
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
