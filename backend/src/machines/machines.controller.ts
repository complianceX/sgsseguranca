import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MachinesService } from './machines.service';
import { BaseController } from '../common/base/base.controller';
import { Machine } from './entities/machine.entity';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';
import { Authorize } from '../auth/authorize.decorator';

@ApiTags('machines')
@Controller('machines')
export class MachinesController extends BaseController<
  Machine,
  CreateMachineDto,
  UpdateMachineDto
> {
  constructor(private readonly machinesService: MachinesService) {
    super(machinesService, 'Máquina');
  }

  @Get()
  @Authorize('can_manage_catalogs')
  findPaginated(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('company_id') companyId?: string,
  ) {
    return this.machinesService.findPaginated({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
      companyId: companyId || undefined,
    });
  }
}
