import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Epi } from './entities/epi.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { BaseService } from '../common/base/base.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';

@Injectable()
export class EpisService extends BaseService<Epi> {
  constructor(
    @InjectRepository(Epi)
    private readonly episRepository: Repository<Epi>,
    tenantService: TenantService,
  ) {
    super(episRepository, tenantService, 'EPI');
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<OffsetPage<Epi>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.episRepository
      .createQueryBuilder('epi')
      .orderBy('epi.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (tenantId) {
      query.where('epi.company_id = :tenantId', { tenantId });
    }

    if (opts?.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      const condition = `(
        LOWER(epi.nome) LIKE :search
        OR LOWER(COALESCE(epi.ca, '')) LIKE :search
      )`;
      if (tenantId) {
        query.andWhere(condition, { search });
      } else {
        query.where(condition, { search });
      }
    }

    const [data, total] = await query.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async count(options?: any): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    const where = options?.where || {};
    return this.episRepository.count({
      where: tenantId ? { ...where, company_id: tenantId } : where,
    });
  }
}
