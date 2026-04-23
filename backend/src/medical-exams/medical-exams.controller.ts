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
import { Authorize } from '../auth/authorize.decorator';
import { AuditAction as ForensicAuditAction } from '../common/decorators/audit-action.decorator';
import { AuditRead } from '../common/security/audit-read.decorator';
import { FindMedicalExamsQueryDto } from './dto/find-medical-exams-query.dto';

@Controller('medical-exams')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class MedicalExamsController {
  constructor(private readonly medicalExamsService: MedicalExamsService) {}

  @Post()
  @Authorize('can_manage_medical_exams')
  create(@Body() createMedicalExamDto: CreateMedicalExamDto) {
    return this.medicalExamsService.create(createMedicalExamDto);
  }

  @Get()
  @Authorize('can_view_medical_exams')
  findPaginated(@Query() query: FindMedicalExamsQueryDto) {
    if (query.cursor) {
      return this.medicalExamsService.findByCursor({
        cursor: query.cursor,
        limit: query.limit,
        tipo_exame: query.tipo_exame,
        resultado: query.resultado,
        user_id: query.user_id,
      });
    }

    return this.medicalExamsService.findPaginated({
      page: query.page,
      limit: query.limit,
      tipo_exame: query.tipo_exame,
      resultado: query.resultado,
      user_id: query.user_id,
    });
  }

  @Get('export/all')
  @Authorize('can_view_medical_exams')
  findAllForExport() {
    return this.medicalExamsService.findAllForExport();
  }

  @Get('expiry/summary')
  @Authorize('can_view_medical_exams')
  findExpirySummary() {
    return this.medicalExamsService.findExpirySummary();
  }

  @Get('export/excel')
  @Authorize('can_view_medical_exams')
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
  @Authorize('can_view_medical_exams')
  @AuditRead('medical_exam')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.medicalExamsService.findOne(id);
  }

  @Patch(':id')
  @Authorize('can_manage_medical_exams')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateMedicalExamDto: UpdateMedicalExamDto,
  ) {
    return this.medicalExamsService.update(id, updateMedicalExamDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
  @Authorize('can_manage_medical_exams')
  @ForensicAuditAction('delete', 'medical_exam')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.medicalExamsService.remove(id);
  }
}
