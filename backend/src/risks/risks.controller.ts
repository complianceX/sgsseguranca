import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
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

  @Post()
  @Authorize('can_edit_risks')
  override create(@Body() createDto: CreateRiskDto): Promise<Risk> {
    return this.risksService.create(createDto);
  }

  @Get()
  @Authorize('can_view_risks')
  override findAll(): Promise<Risk[]> {
    return this.risksService.findAll();
  }

  @Get(':id')
  @Authorize('can_view_risks')
  override findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<Risk> {
    return this.risksService.findOne(id);
  }

  @Patch(':id')
  @Authorize('can_edit_risks')
  override update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateDto: UpdateRiskDto,
  ): Promise<Risk> {
    return this.risksService.update(id, updateDto);
  }

  @Delete(':id')
  @Authorize('can_edit_risks')
  override remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.risksService.remove(id);
  }
}
