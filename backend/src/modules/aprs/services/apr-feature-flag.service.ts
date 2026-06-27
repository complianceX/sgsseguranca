import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AprFeatureFlag } from '../entities/apr-feature-flag.entity';

const FLAG_CACHE_TTL_MS = 30_000;

type CacheEntry = { value: boolean; expiresAt: number };

@Injectable()
export class AprFeatureFlagService {
  private readonly logger = new Logger(AprFeatureFlagService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @InjectRepository(AprFeatureFlag)
    private readonly repo: Repository<AprFeatureFlag>,
  ) {}

  async isEnabled(key: string, tenantId?: string): Promise<boolean> {
    const cacheKey = `${key}:${tenantId ?? '__global__'}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = await this.fetchFromDb(key, tenantId);
    this.cache.set(cacheKey, { value, expiresAt: Date.now() + FLAG_CACHE_TTL_MS });
    return value;
  }

  private async fetchFromDb(key: string, tenantId?: string): Promise<boolean> {
    if (tenantId) {
      const tenantFlag = await this.repo.findOne({
        where: { key, tenantId },
        select: ['enabled'],
      });
      if (tenantFlag !== null) {
        return tenantFlag.enabled;
      }
    }

    const globalFlag = await this.repo.findOne({
      where: { key, tenantId: IsNull() as unknown as string },
      select: ['enabled'],
    });

    return globalFlag?.enabled ?? false;
  }

  async enable(key: string, tenantId?: string): Promise<void> {
    await this.upsert(key, true, tenantId ?? null);
    this.invalidateCache(key, tenantId);
  }

  async disable(key: string, tenantId?: string): Promise<void> {
    await this.upsert(key, false, tenantId ?? null);
    this.invalidateCache(key, tenantId);
  }

  private invalidateCache(key: string, tenantId?: string): void {
    this.cache.delete(`${key}:${tenantId ?? '__global__'}`);
    // Também invalida a entrada global se era uma flag de tenant
    if (tenantId) {
      this.cache.delete(`${key}:__global__`);
    }
  }

  private async upsert(
    key: string,
    enabled: boolean,
    tenantId: string | null,
  ): Promise<void> {
    const where = tenantId
      ? { key, tenantId }
      : { key, tenantId: IsNull() as unknown as string };
    const existing = await this.repo.findOne({ where });
    if (existing) {
      await this.repo.update(existing.id, { enabled });
    } else {
      await this.repo.save(this.repo.create({ key, enabled, tenantId }));
    }
  }
}
