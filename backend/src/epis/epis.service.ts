import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Epi } from './entities/epi.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { BaseService } from '../common/base/base.service';

@Injectable()
export class EpisService extends BaseService<Epi> {
  constructor(
    @InjectRepository(Epi)
    private readonly episRepository: Repository<Epi>,
    tenantService: TenantService,
  ) {
    super(episRepository, tenantService, 'EPI');
  }

  async count(options?: any): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    const where = options?.where || {};
    return this.episRepository.count({
      where: tenantId ? { ...where, company_id: tenantId } : where,
    });
  }
}
