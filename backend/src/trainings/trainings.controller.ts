import {
  BadRequestException,
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
  UploadedFile,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { TrainingsService } from './trainings.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';
import { AuditAction as ForensicAuditAction } from '../common/decorators/audit-action.decorator';
import { ExpiryDaysQueryDto } from './dto/expiry-days-query.dto';
import { FindTrainingsQueryDto } from './dto/find-trainings-query.dto';
import {
  assertUploadedPdf,
  cleanupUploadedTempFile,
  createGovernedPdfUploadOptions,
} from '../common/interceptors/file-upload.interceptor';
import { FileInspectionService } from '../common/security/file-inspection.service';

@Controller('trainings')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class TrainingsController {
  private getRequestUserId(
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ): string | undefined {
    return req.user?.userId ?? req.user?.id ?? req.user?.sub;
  }

  constructor(
    private readonly trainingsService: TrainingsService,
    private readonly fileInspectionService: FileInspectionService,
  ) {}

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_trainings')
  create(@Body() createTrainingDto: CreateTrainingDto) {
    return this.trainingsService.create(createTrainingDto);
  }

  @Get()
  @Authorize('can_view_trainings')
  findPaginated(@Query() query: FindTrainingsQueryDto) {
    if (query.cursor) {
      return this.trainingsService.findByCursor({
        cursor: query.cursor,
        limit: query.limit,
      });
    }

    return this.trainingsService.findPaginated({
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('export/all')
  @Authorize('can_view_trainings')
  findAllForExport() {
    return this.trainingsService.findAllForExport();
  }

  @Get('user/:userId')
  @Authorize('can_view_trainings')
  findByUserId(@Param('userId') userId: string) {
    return this.trainingsService.findByUserId(userId);
  }

  @Get('expiry/summary')
  @Authorize('can_view_trainings')
  getExpirySummary() {
    return this.trainingsService.findExpirySummary();
  }

  @Get('expiry/expiring')
  @Authorize('can_view_trainings')
  getExpiring(@Query() query: ExpiryDaysQueryDto) {
    return this.trainingsService.findExpiring(query.days ?? 7);
  }

  @Post('expiry/notify')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_trainings')
  notifyExpiry(@Query() query: ExpiryDaysQueryDto) {
    return this.trainingsService.dispatchExpiryNotifications(query.days ?? 7);
  }

  @Get('compliance/blocking-users')
  @Authorize('can_view_trainings')
  getBlockingUsers() {
    return this.trainingsService.findBlockingUsers();
  }

  @Get('compliance/user/:userId')
  @Authorize('can_view_trainings')
  getComplianceByUser(@Param('userId') userId: string) {
    return this.trainingsService.getComplianceByUser(userId);
  }

  @Get('export/excel')
  @Authorize('can_view_trainings')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="treinamentos.xlsx"')
  async exportExcel(): Promise<StreamableFile> {
    const buffer = await this.trainingsService.exportExcel();
    return new StreamableFile(buffer);
  }

  @Get(':id/pdf')
  @Authorize('can_view_trainings')
  getPdfAccess(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.trainingsService.getPdfAccess(id);
  }

  @Get(':id')
  @Authorize('can_view_trainings')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.trainingsService.findOne(id);
  }

  @Post(':id/pdf/file')
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_trainings')
  async attachPdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    const pdfFile = await assertUploadedPdf(
      file,
      'Nenhum PDF de treinamento enviado.',
      this.fileInspectionService,
    );
    try {
      return await this.trainingsService.attachPdf(
        id,
        pdfFile,
        this.getRequestUserId(req),
      );
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        /empresa/i.test(String(error.message))
      ) {
        throw error;
      }
      throw error;
    } finally {
      await cleanupUploadedTempFile(pdfFile);
    }
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_trainings')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateTrainingDto: UpdateTrainingDto,
  ) {
    return this.trainingsService.update(id, updateTrainingDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_manage_trainings')
  @ForensicAuditAction('delete', 'training')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.trainingsService.remove(id);
  }
}
