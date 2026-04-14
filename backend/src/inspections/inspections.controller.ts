import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UnauthorizedException,
  ParseUUIDPipe,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InspectionsService } from './inspections.service';
import {
  CreateInspectionDto,
  UpdateInspectionDto,
} from './dto/create-inspection.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantService } from '../common/tenant/tenant.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';
import { AuditAction as ForensicAuditAction } from '../common/decorators/audit-action.decorator';
import type { Response } from 'express';
import {
  assertUploadedPdf,
  assertUploadedVideo,
  cleanupUploadedTempFile,
  createGovernedPdfUploadOptions,
  createGovernedVideoUploadOptions,
  createTemporaryUploadOptions,
  readUploadedFileBuffer,
} from '../common/interceptors/file-upload.interceptor';

@Controller('inspections')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class InspectionsController {
  constructor(
    private readonly inspectionsService: InspectionsService,
    private readonly tenantService: TenantService,
  ) {}

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException(
        'Contexto de empresa não identificado. Faça login novamente ou selecione uma empresa.',
      );
    }
    return tenantId;
  }

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_inspections')
  create(@Body() createInspectionDto: CreateInspectionDto) {
    return this.inspectionsService.create(
      createInspectionDto,
      this.getTenantIdOrThrow(),
    );
  }

  @Get()
  @Authorize('can_view_inspections')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.inspectionsService.findPaginated(this.getTenantIdOrThrow(), {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
    });
  }

  @Get('files/list')
  @Authorize('can_view_inspections')
  listStoredFiles(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ) {
    return this.inspectionsService.listStoredFiles({
      companyId,
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
  }

  @Get('files/weekly-bundle')
  @Authorize('can_view_inspections')
  async getWeeklyBundle(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.inspectionsService.getWeeklyBundle({
      companyId,
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });

    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${fileName}"`,
      type: 'application/pdf',
    });
  }

  @Get(':id')
  @Authorize('can_view_inspections')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.inspectionsService.findOne(id, this.getTenantIdOrThrow());
  }

  @Get(':id/pdf')
  @Authorize('can_view_inspections')
  getPdfAccess(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.inspectionsService.getPdfAccess(id, this.getTenantIdOrThrow());
  }

  @Get(':id/evidences/:index/file')
  @Authorize('can_view_inspections')
  async downloadEvidence(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('index') index: string,
    @Res() res: Response,
  ) {
    const tenantId = this.getTenantIdOrThrow();
    const numericIndex = Number(index);
    if (!Number.isInteger(numericIndex) || numericIndex < 0) {
      throw new BadRequestException('Índice de evidência inválido.');
    }

    const { buffer, contentType, filename } =
      await this.inspectionsService.downloadEvidenceFile(
        id,
        numericIndex,
        tenantId,
      );

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(buffer);
  }

  @Get(':id/videos')
  @Authorize('can_view_inspections')
  listVideoAttachments(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.inspectionsService.listVideoAttachments(
      id,
      this.getTenantIdOrThrow(),
    );
  }

  @Get(':id/videos/:attachmentId/access')
  @Authorize('can_view_inspections')
  getVideoAttachmentAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ) {
    return this.inspectionsService.getVideoAttachmentAccess(
      id,
      attachmentId,
      this.getTenantIdOrThrow(),
    );
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_inspections')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateInspectionDto: UpdateInspectionDto,
  ) {
    return this.inspectionsService.update(
      id,
      updateInspectionDto,
      this.getTenantIdOrThrow(),
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_inspections')
  @ForensicAuditAction('delete', 'inspection')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.inspectionsService.remove(id, this.getTenantIdOrThrow());
  }

  @Post(':id/evidences')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_inspections')
  @UseInterceptors(
    FileInterceptor(
      'file',
      createTemporaryUploadOptions({
        maxFileSize: 15 * 1024 * 1024,
      }),
    ),
  )
  async attachEvidence(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('descricao') descricao?: string,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    try {
      return await this.inspectionsService.attachEvidence(
        id,
        file,
        descricao,
        this.getTenantIdOrThrow(),
      );
    } finally {
      await cleanupUploadedTempFile(file);
    }
  }

  @Post(':id/videos')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_inspections')
  @UseInterceptors(FileInterceptor('file', createGovernedVideoUploadOptions()))
  async uploadVideoAttachment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const videoFile = await assertUploadedVideo(file, 'Nenhum vídeo enviado.');
    try {
      return await this.inspectionsService.uploadVideoAttachment(
        id,
        await readUploadedFileBuffer(videoFile),
        videoFile.originalname,
        videoFile.mimetype,
        this.getTenantIdOrThrow(),
      );
    } finally {
      await cleanupUploadedTempFile(videoFile);
    }
  }

  @Delete(':id/videos/:attachmentId')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_inspections')
  @ForensicAuditAction('delete', 'inspection_video_attachment')
  removeVideoAttachment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ) {
    return this.inspectionsService.removeVideoAttachment(
      id,
      attachmentId,
      this.getTenantIdOrThrow(),
    );
  }

  @Post(':id/file')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_inspections')
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.handlePdfUpload(id, file);
  }

  private async handlePdfUpload(id: string, file?: Express.Multer.File) {
    const pdfFile = await assertUploadedPdf(file);
    try {
      return await this.inspectionsService.savePdf(
        id,
        pdfFile,
        this.getTenantIdOrThrow(),
      );
    } finally {
      await cleanupUploadedTempFile(pdfFile);
    }
  }
}
