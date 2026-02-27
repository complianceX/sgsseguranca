import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tool } from './entities/tool.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { BaseService } from '../common/base/base.service';

@Injectable()
export class ToolsService extends BaseService<Tool> {
  constructor(
    @InjectRepository(Tool)
    private readonly toolsRepository: Repository<Tool>,
    tenantService: TenantService,
  ) {
    super(toolsRepository, tenantService, 'Ferramenta');
  }
}
