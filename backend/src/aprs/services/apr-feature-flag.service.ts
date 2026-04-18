import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AprFeatureFlag } from '../entities/apr-feature-flag.entity';

@Injectable()
export class AprFeatureFlagService {
  private readonly logger = new Logger(AprFeatureFlagService.name);

  constructor(
    @InjectRepository(AprFeatureFlag)
    private readonly repo: Repository<AprFeatureFlag>,
  ) {}

  async isEnabled(key: string, tenantId?: string): Promise<boolean> {
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
  }

  async disable(key: string, tenantId?: string): Promise<void> {
    await this.upsert(key, false, tenantId ?? null);
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
