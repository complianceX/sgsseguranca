import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RdosService } from './rdos.service';
import { CreateRdoDto } from './dto/create-rdo.dto';
import { FindRdosQueryDto } from './dto/find-rdos-query.dto';
import { UpdateRdoDto } from './dto/update-rdo.dto';
import { SignRdoDto } from './dto/sign-rdo.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { CancelRdoDto } from './dto/cancel-rdo.dto';
import { UpdateRdoStatusDto } from './dto/update-rdo-status.dto';
import { RdoAuditResponseDto } from './dto/rdo-audit-response.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';
import { PdfRateLimitService } from '../auth/services/pdf-rate-limit.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { AuditAction as ForensicAuditAction } from '../common/decorators/audit-action.decorator';
import {
  assertUploadedPdf,
  assertUploadedVideo,
  cleanupUploadedTempFile,
  createGovernedPdfUploadOptions,
  createGovernedVideoUploadOptions,
  createTemporaryUploadOptions,
  inspectUploadedFileBuffer,
  readUploadedFileBuffer,
  validateFileMagicBytes,
} from '../common/interceptors/file-upload.interceptor';
import { FileInspectionService } from '../common/security/file-inspection.service';

@Controller('rdos')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class RdosController {
  constructor(
    private readonly rdosService: RdosService,
    private readonly pdfRateLimitService: PdfRateLimitService,
    private readonly fileInspectionService: FileInspectionService,
  ) {}

  private getRequestUserId(
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ): string | undefined {
    return req.user?.userId ?? req.user?.id ?? req.user?.sub;
  }

  private getRequestIp(
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ): string {
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  private getRequestErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Usuário não autorizado';
  }

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_rdos')
  create(@Body() createRdoDto: CreateRdoDto) {
    return this.rdosService.create(createRdoDto);
  }

  @Get()
  @Authorize('can_view_rdos')
  findPaginated(@Query() query: FindRdosQueryDto) {
    return this.rdosService.findPaginated(query);
  }

  @Get('files/list')
  @Authorize('can_view_rdos')
  listStoredFiles(@Query('year') year?: string, @Query('week') week?: string) {
    return this.rdosService.listFiles({
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
  }

  @Get('files/weekly-bundle')
  @Authorize('can_view_rdos')
  async getWeeklyBundle(
    @Query('year') year?: string,
    @Query('week') week?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.rdosService.getWeeklyBundle({
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });

    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${fileName}"`,
      type: 'application/pdf',
    });
  }

  @Get('export/excel')
  @Authorize('can_view_rdos')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="rdos.xlsx"')
  async exportExcel(): Promise<StreamableFile> {
    const buffer = await this.rdosService.exportExcel();
    return new StreamableFile(buffer);
  }

  @Get('analytics/overview')
  @Authorize('can_view_rdos')
  getAnalyticsOverview() {
    return this.rdosService.getAnalyticsOverview();
  }

  @Get(':id')
  @Authorize('can_view_rdos')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rdosService.findOne(id);
  }

  @Get(':id/pdf')
  @Authorize('can_view_rdos')
  async getPdfAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    try {
      const userId = this.getRequestUserId(req);
      if (userId) {
        await this.pdfRateLimitService.checkDownloadLimit(
          userId,
          this.getRequestIp(req),
        );
      }
    } catch (error) {
      throw new UnauthorizedException(this.getRequestErrorMessage(error));
    }

    return this.rdosService.getPdfAccess(id);
  }

  @Get(':id/videos')
  @Authorize('can_view_rdos')
  listVideoAttachments(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rdosService.listVideoAttachments(id);
  }

  @Get(':id/activities/:activityIndex/photos/:photoIndex/access')
  @Authorize('can_view_rdos')
  getActivityPhotoAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('activityIndex', ParseIntPipe) activityIndex: number,
    @Param('photoIndex', ParseIntPipe) photoIndex: number,
  ) {
    return this.rdosService.getActivityPhotoAccess(
      id,
      activityIndex,
      photoIndex,
    );
  }

  @Get(':id/videos/:attachmentId/access')
  @Authorize('can_view_rdos')
  getVideoAttachmentAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ) {
    return this.rdosService.getVideoAttachmentAccess(id, attachmentId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_rdos')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateRdoDto: UpdateRdoDto,
  ) {
    return this.rdosService.update(id, updateRdoDto);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_rdos')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateRdoStatusDto,
  ) {
    return this.rdosService.updateStatus(id, body.status);
  }

  @Patch(':id/sign')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_rdos')
  sign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SignRdoDto,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    return this.rdosService.sign(id, body, this.getRequestUserId(req));
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_rdos')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CancelRdoDto,
  ) {
    return this.rdosService.cancel(id, body.reason);
  }

  @Post(':id/save-pdf')
  @Header('Deprecation', 'true')
  @Header('Sunset', 'Tue, 30 Jun 2026 00:00:00 GMT')
  @Header(
    'Warning',
    '299 - "Endpoint legado descontinuado. Use POST /rdos/:id/file para anexar o PDF final governado."',
  )
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_rdos')
  savePdfLegacy(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { filename?: string },
  ) {
    return this.rdosService.markPdfSaved(id, body);
  }

  @Post(':id/file')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_rdos')
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  async attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const pdfFile = await assertUploadedPdf(
      file,
      undefined,
      this.fileInspectionService,
    );
    try {
      return await this.rdosService.savePdf(id, pdfFile);
    } finally {
      await cleanupUploadedTempFile(pdfFile);
    }
  }

  @Post(':id/videos')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_rdos')
  @UseInterceptors(FileInterceptor('file', createGovernedVideoUploadOptions()))
  async uploadVideoAttachment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const videoFile = await assertUploadedVideo(
      file,
      'Arquivo de vídeo não enviado.',
      this.fileInspectionService,
    );
    try {
      return await this.rdosService.uploadVideoAttachment(
        id,
        await readUploadedFileBuffer(videoFile),
        videoFile.originalname,
        videoFile.mimetype,
      );
    } finally {
      await cleanupUploadedTempFile(videoFile);
    }
  }

  @Post(':id/activities/:activityIndex/photos')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_rdos')
  @UseInterceptors(
    FileInterceptor(
      'file',
      createTemporaryUploadOptions({ maxFileSize: 10 * 1024 * 1024 }),
    ),
  )
  async uploadActivityPhoto(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('activityIndex', ParseIntPipe) activityIndex: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const imageFile = file;
    if (!imageFile) {
      throw new BadRequestException('Foto da atividade não enviada.');
    }

    const buffer = await readUploadedFileBuffer(imageFile);

    try {
      validateFileMagicBytes(buffer, ['image/jpeg', 'image/png', 'image/webp']);
      await inspectUploadedFileBuffer(
        buffer,
        imageFile,
        this.fileInspectionService,
      );
      return await this.rdosService.attachActivityPhoto(
        id,
        activityIndex,
        buffer,
        imageFile.originalname,
        imageFile.mimetype,
      );
    } finally {
      await cleanupUploadedTempFile(imageFile);
    }
  }

  @Delete(':id/videos/:attachmentId')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_rdos')
  @ForensicAuditAction('delete', 'rdo_video_attachment')
  removeVideoAttachment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ) {
    return this.rdosService.removeVideoAttachment(id, attachmentId);
  }

  @Delete(':id/activities/:activityIndex/photos/:photoIndex')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_rdos')
  removeActivityPhoto(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('activityIndex', ParseIntPipe) activityIndex: number,
    @Param('photoIndex', ParseIntPipe) photoIndex: number,
  ) {
    return this.rdosService.removeActivityPhoto(id, activityIndex, photoIndex);
  }

  @Post(':id/send-email')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_rdos')
  sendEmail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SendEmailDto,
  ) {
    if (!body.to.length) {
      throw new BadRequestException(
        'Informe pelo menos um destinatário para envio.',
      );
    }
    return this.rdosService.sendEmail(id, body.to);
  }

  @Get(':id/audit')
  @ApiOperation({ summary: 'Obtém a trilha de auditoria do RDO' })
  @ApiResponse({
    status: 200,
    description: 'Trilha cronológica das atividades do documento.',
    type: [RdoAuditResponseDto],
  })
  @Authorize('can_view_rdos')
  getAuditTrail(@Param('id', ParseUUIDPipe) id: string) {
    return this.rdosService.getAuditTrail(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_rdos')
  @ForensicAuditAction('delete', 'rdo')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rdosService.remove(id);
  }
}
