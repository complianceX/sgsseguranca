import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Machine } from './entities/machine.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { BaseService } from '../common/base/base.service';

@Injectable()
export class MachinesService extends BaseService<Machine> {
  constructor(
    @InjectRepository(Machine)
    private readonly machinesRepository: Repository<Machine>,
    tenantService: TenantService,
  ) {
    super(machinesRepository, tenantService, 'Máquina');
  }
}
