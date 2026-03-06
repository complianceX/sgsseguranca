import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RisksService } from './risks.service';
import { BaseController } from '../common/base/base.controller';
import { Risk } from './entities/risk.entity';
import { CreateRiskDto } from './dto/create-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';
import { Authorize } from '../auth/authorize.decorator';

@ApiTags('risks')
@Controller('risks')
export class RisksController extends BaseController<
  Risk,
  CreateRiskDto,
  UpdateRiskDto
> {
  constructor(private readonly risksService: RisksService) {
    super(risksService, 'Risco');
  }

  @Patch(':id')
  @Authorize('can_view_risks')
  override update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateDto: UpdateRiskDto,
  ): Promise<Risk> {
    return this.risksService.update(id, updateDto);
  }
}
