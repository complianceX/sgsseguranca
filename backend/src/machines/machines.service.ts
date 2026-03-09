import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Machine } from './entities/machine.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { BaseService } from '../common/base/base.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';

@Injectable()
export class MachinesService extends BaseService<Machine> {
  constructor(
    @InjectRepository(Machine)
    private readonly machinesRepository: Repository<Machine>,
    tenantService: TenantService,
  ) {
    super(machinesRepository, tenantService, 'Máquina');
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    companyId?: string;
  }): Promise<OffsetPage<Machine>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.machinesRepository
      .createQueryBuilder('machine')
      .orderBy('machine.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (tenantId) {
      query.where('machine.company_id = :tenantId', { tenantId });
    } else if (opts?.companyId) {
      query.where('machine.company_id = :companyId', {
        companyId: opts.companyId,
      });
    }

    if (opts?.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      const clause = `(
        LOWER(machine.nome) LIKE :search
        OR LOWER(COALESCE(machine.placa, '')) LIKE :search
        OR LOWER(COALESCE(machine.descricao, '')) LIKE :search
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
