import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Query,
  Header,
  StreamableFile,
} from '@nestjs/common';
import { NonConformitiesService, NcStatus } from './nonconformities.service';
import {
  CreateNonConformityDto,
  UpdateNonConformityDto,
} from './dto/create-nonconformity.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  cleanupUploadedTempFile,
  createTemporaryUploadOptions,
  fileUploadOptions,
  readUploadedFileBuffer,
  validateFileMagicBytes,
  validatePdfMagicBytes,
} from '../common/interceptors/file-upload.interceptor';
import { Authorize } from '../auth/authorize.decorator';
import { AuditAction as ForensicAuditAction } from '../common/decorators/audit-action.decorator';

@Controller('nonconformities')
@UseGuards(JwtAuthGuard, TenantGuard)
@UseInterceptors(TenantInterceptor)
export class NonConformitiesController {
  constructor(
    private readonly nonConformitiesService: NonConformitiesService,
  ) {}

  @Post()
  @Authorize('can_manage_nc')
  create(@Body() createNonConformityDto: CreateNonConformityDto) {
    return this.nonConformitiesService.create(createNonConformityDto);
  }

  @Get()
  @Authorize('can_manage_nc')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.nonConformitiesService.findPaginated({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
    });
  }

  @Get('files/list')
  @Authorize('can_manage_nc')
  listStoredFiles(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ) {
    return this.nonConformitiesService.listStoredFiles({
      companyId,
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
  }

  @Get('files/weekly-bundle')
  @Authorize('can_manage_nc')
  async getWeeklyBundle(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } =
      await this.nonConformitiesService.getWeeklyBundle({
        companyId,
        year: year ? Number(year) : undefined,
        week: week ? Number(week) : undefined,
      });

    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${fileName}"`,
      type: 'application/pdf',
    });
  }

  @Get('analytics/monthly')
  @Authorize('can_manage_nc')
  getMonthlyAnalytics() {
    return this.nonConformitiesService.getMonthlyAnalytics();
  }

  @Get('analytics/overview')
  @Authorize('can_manage_nc')
  getAnalyticsOverview() {
    return this.nonConformitiesService.getAnalyticsOverview();
  }

  @Get('export/excel')
  @Authorize('can_manage_nc')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header(
    'Content-Disposition',
    'attachment; filename="nao-conformidades.xlsx"',
  )
  async exportExcel(): Promise<StreamableFile> {
    const buffer = await this.nonConformitiesService.exportExcel();
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @Authorize('can_manage_nc')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.nonConformitiesService.findOne(id);
  }

  @Get(':id/pdf')
  @Authorize('can_manage_nc')
  getPdf(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.nonConformitiesService.getPdfAccess(id);
  }

  @Get(':id/attachments/:index/access')
  @Authorize('can_manage_nc')
  getAttachmentAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('index', ParseIntPipe) index: number,
  ) {
    return this.nonConformitiesService.getAttachmentAccess(id, index);
  }

  @Post(':id/file')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  @Authorize('can_manage_nc')
  async attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo PDF não enviado');
    }
    const buffer = await readUploadedFileBuffer(file);

    try {
      // Segurança: valida PDF por magic bytes (não confiar apenas em mimetype)
      validatePdfMagicBytes(buffer);

      return await this.nonConformitiesService.attachPdf(
        id,
        buffer,
        file.originalname,
        file.mimetype,
      );
    } finally {
      await cleanupUploadedTempFile(file);
    }
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor(
      'file',
      createTemporaryUploadOptions({ maxFileSize: 10 * 1024 * 1024 }),
    ),
  )
  @Authorize('can_manage_nc')
  async attachAttachment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo de evidência não enviado');
    }

    const buffer = await readUploadedFileBuffer(file);

    try {
      validateFileMagicBytes(buffer, [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
      ]);

      return await this.nonConformitiesService.attachAttachment(
        id,
        buffer,
        file.originalname,
        file.mimetype,
      );
    } finally {
      await cleanupUploadedTempFile(file);
    }
  }

  @Patch(':id/status')
  @Authorize('can_manage_nc')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('status') status: NcStatus,
  ) {
    return this.nonConformitiesService.updateStatus(id, status);
  }

  @Patch(':id')
  @Authorize('can_manage_nc')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateNonConformityDto: UpdateNonConformityDto,
  ) {
    return this.nonConformitiesService.update(id, updateNonConformityDto);
  }

  @Delete(':id')
  @Authorize('can_manage_nc')
  @ForensicAuditAction('delete', 'non_conformity')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.nonConformitiesService.remove(id);
  }
}
