import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  constructor(
    @InjectRepository(Tool)
    private readonly toolsRepository: Repository<Tool>,
    tenantService: TenantService,
  ) {
    super(toolsRepository, tenantService, 'Ferramenta');
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
}
