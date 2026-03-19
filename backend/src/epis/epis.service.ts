import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, FindOptionsWhere, Repository } from 'typeorm';
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
    companyId?: string;
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
    } else if (opts?.companyId) {
      query.where('epi.company_id = :companyId', {
        companyId: opts.companyId,
      });
    }

    if (opts?.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      const condition = `(
        LOWER(epi.nome) LIKE :search
        OR LOWER(COALESCE(epi.ca, '')) LIKE :search
      )`;
      if (tenantId || opts?.companyId) {
        query.andWhere(condition, { search });
      } else {
        query.where(condition, { search });
      }
    }

    const [data, total] = await query.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async count(options?: FindManyOptions<Epi>): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    const where =
      options?.where ?? ({} as FindOptionsWhere<Epi> | FindOptionsWhere<Epi>[]);
    return this.episRepository.count({
      ...(options ?? {}),
      where: tenantId ? { ...where, company_id: tenantId } : where,
    });
  }

  async findCaExpirySummary(days = 30): Promise<{
    total: number;
    expired: number;
    expiringSoon: number;
    withoutValidity: number;
    windowDays: number;
  }> {
    const tenantId = this.tenantService.getTenantId();
    const now = new Date();
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + days);

    const query = this.episRepository.createQueryBuilder('epi');
    if (tenantId) {
      query.where('epi.company_id = :tenantId', { tenantId });
    }

    const epis = await query.getMany();

    const summary = epis.reduce(
      (acc, epi) => {
        acc.total += 1;

        if (!epi.validade_ca) {
          acc.withoutValidity += 1;
          return acc;
        }

        const validityDate = new Date(epi.validade_ca);
        if (Number.isNaN(validityDate.getTime())) {
          acc.withoutValidity += 1;
          return acc;
        }

        if (validityDate < now) {
          acc.expired += 1;
        } else if (validityDate <= limitDate) {
          acc.expiringSoon += 1;
        }

        return acc;
      },
      {
        total: 0,
        expired: 0,
        expiringSoon: 0,
        withoutValidity: 0,
        windowDays: days,
      },
    );

    return summary;
  }
}
