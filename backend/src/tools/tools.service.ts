import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Tool } from './entities/tool.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { BaseService } from '../common/base/base.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';

@Injectable()
export class ToolsService extends BaseService<Tool> {
  private readonly catalogCacheTtlMs = 30 * 60 * 1000;

  constructor(
    @InjectRepository(Tool)
    private readonly toolsRepository: Repository<Tool>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    tenantService: TenantService,
  ) {
    super(toolsRepository, tenantService, 'Ferramenta');
  }

  override async findAll(
    where: FindOptionsWhere<Tool> = {},
    options?: { take?: number; select?: (keyof Tool)[] },
  ): Promise<Tool[]> {
    const tenantId = this.tenantService.getTenantId();
    const hasFilters = Object.keys(where || {}).length > 0;
    if (!tenantId || hasFilters) {
      return super.findAll(where, options);
    }

    const cacheKey = this.buildCatalogCacheKey(tenantId);
    const variantKey = this.buildCatalogVariantKey(options);
    const cachedByVariant =
      await this.cacheManager.get<Record<string, Tool[]>>(cacheKey);
    const cachedVariant = cachedByVariant?.[variantKey];
    if (cachedVariant) {
      return cachedVariant;
    }

    const data = await this.toolsRepository.find({
      where: { company_id: tenantId },
      ...(options?.take !== undefined ? { take: options.take } : { take: 500 }),
      ...(options?.select?.length ? { select: options.select } : {}),
      order: { nome: 'ASC' },
    });

    await this.cacheManager.set(
      cacheKey,
      {
        ...(cachedByVariant || {}),
        [variantKey]: data,
      },
      this.catalogCacheTtlMs,
    );

    return data;
  }

  override async create(data: Partial<Tool>): Promise<Tool> {
    const created = await super.create(data);
    await this.invalidateCatalogCache(created.company_id);
    return created;
  }

  override async update(id: string, data: Partial<Tool>): Promise<Tool> {
    const updated = await super.update(id, data);
    await this.invalidateCatalogCache(updated.company_id);
    return updated;
  }

  override async remove(id: string): Promise<void> {
    const current = await this.findOne(id);
    await super.remove(id);
    await this.invalidateCatalogCache(current.company_id);
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    companyId?: string;
  }): Promise<OffsetPage<Tool>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.toolsRepository
      .createQueryBuilder('tool')
      .orderBy('tool.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (tenantId) {
      query.where('tool.company_id = :tenantId', { tenantId });
    } else if (opts?.companyId) {
      query.where('tool.company_id = :companyId', {
        companyId: opts.companyId,
      });
    }

    if (opts?.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      const clause = `(
        LOWER(tool.nome) LIKE :search
        OR LOWER(COALESCE(tool.numero_serie, '')) LIKE :search
        OR LOWER(COALESCE(tool.descricao, '')) LIKE :search
      )`;
      if (tenantId || opts?.companyId) {
        query.andWhere(clause, { search });
      } else {
        query.where(clause, { search });
      }
    }

    const [data, total] = await query.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  private buildCatalogCacheKey(tenantId: string): string {
    return `catalog:tools:${tenantId}`;
  }

  private buildCatalogVariantKey(options?: {
    take?: number;
    select?: (keyof Tool)[];
  }): string {
    const take = options?.take ?? 500;
    const select = Array.isArray(options?.select)
      ? options.select
          .map((field) => String(field))
          .sort()
          .join(',')
      : '';
    return `take:${take}|select:${select || '*'}`;
  }

  private async invalidateCatalogCache(
    tenantId?: string | null,
  ): Promise<void> {
    if (!tenantId) {
      return;
    }
    await this.cacheManager.del(this.buildCatalogCacheKey(tenantId));
  }
}
