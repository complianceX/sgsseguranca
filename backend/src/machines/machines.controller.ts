import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MachinesService } from './machines.service';
import { BaseController } from '../common/base/base.controller';
import { Machine } from './entities/machine.entity';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';

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
}
