import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseUUIDPipe,
  Delete,
  UseGuards,
  UseInterceptors,
  Query,
  Header,
  StreamableFile,
} from '@nestjs/common';
import { RdosService } from './rdos.service';
import { CreateRdoDto } from './dto/create-rdo.dto';
import { UpdateRdoDto } from './dto/update-rdo.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Role } from '../auth/enums/roles.enum';

@Controller('rdos')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class RdosController {
  constructor(private readonly rdosService: RdosService) {}

  @Post()
  create(@Body() createRdoDto: CreateRdoDto) {
    return this.rdosService.create(createRdoDto);
  }

  @Get()
  findPaginated(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('site_id') site_id?: string,
    @Query('status') status?: string,
    @Query('data_inicio') data_inicio?: string,
    @Query('data_fim') data_fim?: string,
  ) {
    return this.rdosService.findPaginated({
      page: Number(page),
      limit: Number(limit),
      site_id: site_id || undefined,
      status: status || undefined,
      data_inicio: data_inicio || undefined,
      data_fim: data_fim || undefined,
    });
  }

  @Get('export/excel')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="rdos.xlsx"')
  async exportExcel(): Promise<StreamableFile> {
    const buffer = await this.rdosService.exportExcel();
    return new StreamableFile(buffer);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rdosService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateRdoDto: UpdateRdoDto,
  ) {
    return this.rdosService.update(id, updateRdoDto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('status') status: string,
  ) {
    return this.rdosService.updateStatus(id, status);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rdosService.remove(id);
  }
}
