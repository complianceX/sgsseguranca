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
import { MedicalExamsService } from './medical-exams.service';
import { CreateMedicalExamDto } from './dto/create-medical-exam.dto';
import { UpdateMedicalExamDto } from './dto/update-medical-exam.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Role } from '../auth/enums/roles.enum';

@Controller('medical-exams')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class MedicalExamsController {
  constructor(private readonly medicalExamsService: MedicalExamsService) {}

  @Post()
  create(@Body() createMedicalExamDto: CreateMedicalExamDto) {
    return this.medicalExamsService.create(createMedicalExamDto);
  }

  @Get()
  findPaginated(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('tipo_exame') tipo_exame?: string,
    @Query('resultado') resultado?: string,
    @Query('user_id') user_id?: string,
  ) {
    return this.medicalExamsService.findPaginated({
      page: Number(page),
      limit: Number(limit),
      tipo_exame: tipo_exame || undefined,
      resultado: resultado || undefined,
      user_id: user_id || undefined,
    });
  }

  @Get('expiry/summary')
  findExpirySummary() {
    return this.medicalExamsService.findExpirySummary();
  }

  @Get('export/excel')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="exames-medicos.xlsx"')
  async exportExcel(): Promise<StreamableFile> {
    const buffer = await this.medicalExamsService.exportExcel();
    return new StreamableFile(buffer);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.medicalExamsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateMedicalExamDto: UpdateMedicalExamDto,
  ) {
    return this.medicalExamsService.update(id, updateMedicalExamDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.medicalExamsService.remove(id);
  }
}
