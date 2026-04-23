import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MachinesService } from './machines.service';
import { BaseController } from '../common/base/base.controller';
import { Machine } from './entities/machine.entity';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';
import { Authorize } from '../auth/authorize.decorator';
import { CatalogQueryDto } from '../common/dto/catalog-query.dto';

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
  findPaginated(@Query() query: CatalogQueryDto) {
    return this.machinesService.findPaginated(query);
  }
}
