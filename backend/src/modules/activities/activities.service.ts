import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { Repository, DeepPartial, FindManyOptions } from 'typeorm';
import { Activity } from './entities/activity.entity';
import { TenantService } from '../../shared/tenant/tenant.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../../shared/utils/offset-pagination.util';
import { normalizeOptionalSearchQuery } from '../../shared/utils/query-normalization.util';
import { escapeLikePattern } from '../../shared/utils/sql.util';

@Injectable()
export class ActivitiesService {
  private readonly catalogCacheTtlMs = 30 * 60 * 1000;

  constructor(
    @InjectRepository(Activity)
    private activitiesRepository: Repository<Activity>,
    private tenantService: TenantService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException(
        'Contexto de empresa não identificado para atividades.',
      );
    }
    return tenantId;
  }

  async create(createActivityDto: DeepPartial<Activity>): Promise<Activity> {
    const tenantId = this.getTenantIdOrThrow();
    const { company_id, ...rest } =
      createActivityDto as DeepPartial<Activity> & { company_id?: string };

    if (company_id !== undefined) {
      throw new BadRequestException(
        'company_id não é permitido no payload. O tenant autenticado define a empresa.',
      );
    }

    const activity = this.activitiesRepository.create({
      ...rest,
      company_id: tenantId,
    });
    const saved = await this.activitiesRepository.save(activity);
    await this.invalidateCatalogCache(saved.company_id || tenantId);
    return saved;
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    companyId?: string;
  }): Promise<OffsetPage<Activity>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.activitiesRepository
      .createQueryBuilder('activity')
      .orderBy('activity.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (tenantId) {
      query.where('activity.company_id = :companyId', { companyId: tenantId });
    } else if (opts?.companyId) {
      query.where('activity.company_id = :companyId', {
        companyId: opts.companyId,
      });
    } else {
      query.where('1 = 1');
    }
    query.andWhere('activity.deleted_at IS NULL');

    const searchTerm = normalizeOptionalSearchQuery(opts?.search);
    if (searchTerm) {
      const search = `%${escapeLikePattern(searchTerm.toLowerCase())}%`;
      const condition = `(
        LOWER(activity.nome) LIKE :search ESCAPE '\\'
        OR LOWER(COALESCE(activity.descricao, '')) LIKE :search ESCAPE '\\'
      )`;
      query.andWhere(condition, { search });
    }

    const [data, total] = await query.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findAll(): Promise<Activity[]> {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context ausente');
    }

    const cacheKey = this.buildCatalogCacheKey(tenantId);
    const cached = await this.cacheManager.get<Activity[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await this.activitiesRepository.find({
      where: { company_id: tenantId },
      take: 500,
      order: { nome: 'ASC' },
    });
    await this.cacheManager.set(cacheKey, data, this.catalogCacheTtlMs);
    return data;
  }

  async findOne(id: string): Promise<Activity> {
    const tenantId = this.getTenantIdOrThrow();
    const activity = await this.activitiesRepository.findOne({
      where: { id, company_id: tenantId },
    });
    if (!activity) {
      throw new NotFoundException(`Atividade com ID ${id} não encontrada`);
    }
    return activity;
  }

  async update(
    id: string,
    updateActivityDto: DeepPartial<Activity>,
  ): Promise<Activity> {
    const activity = await this.findOne(id);
    Object.assign(activity, updateActivityDto);
    const saved = await this.activitiesRepository.save(activity);
    await this.invalidateCatalogCache(saved.company_id);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const activity = await this.findOne(id);
    await this.activitiesRepository.softDelete(id);
    await this.invalidateCatalogCache(activity.company_id);
  }

  async count(options?: FindManyOptions<Activity>): Promise<number> {
    return this.activitiesRepository.count(options);
  }

  private buildCatalogCacheKey(tenantId: string): string {
    return `catalog:activities:${tenantId}`;
  }

  private async invalidateCatalogCache(tenantId?: string): Promise<void> {
    if (!tenantId) {
      return;
    }
    await this.cacheManager.del(this.buildCatalogCacheKey(tenantId));
  }
}
