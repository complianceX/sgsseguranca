import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Risk } from './entities/risk.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { BaseService } from '../common/base/base.service';

@Injectable()
export class RisksService extends BaseService<Risk> {
  constructor(
    @InjectRepository(Risk)
    private readonly risksRepository: Repository<Risk>,
    tenantService: TenantService,
  ) {
    super(risksRepository, tenantService, 'Risco');
  }
}
