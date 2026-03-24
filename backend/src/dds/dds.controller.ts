import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Put,
  Param,
  ParseUUIDPipe,
  Delete,
  UseGuards,
  UseInterceptors,
  Req,
  Query,
  UnauthorizedException,
  StreamableFile,
  UploadedFile,
  BadRequestException,
  GoneException,
  Header,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { DdsService } from './dds.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CreateDdsDto } from './dto/create-dds.dto';
import { UpdateDdsDto } from './dto/update-dds.dto';
import { ReplaceDdsSignaturesDto } from './dto/replace-dds-signatures.dto';
import { PdfRateLimitService } from '../auth/services/pdf-rate-limit.service';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';
import { DdsStatus } from './entities/dds.entity';
import {
  assertUploadedVideo,
  assertUploadedPdf,
  cleanupUploadedTempFile,
  createGovernedPdfUploadOptions,
  createGovernedVideoUploadOptions,
  readUploadedFileBuffer,
} from '../common/interceptors/file-upload.interceptor';

@Controller('dds')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class DdsController {
  private readonly logger = new Logger(DdsController.name);

  private getRequestUserId(
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ): string | undefined {
    return req.user?.userId ?? req.user?.id ?? req.user?.sub;
  }

  private getRequestErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Usuário não autorizado';
  }

  private getRequestIp(
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ): string {
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  constructor(
    private readonly ddsService: DdsService,
    private readonly pdfRateLimitService: PdfRateLimitService,
  ) {}

  private getAuthenticatedUserIdOrThrow(
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ): string {
    const userId = this.getRequestUserId(req);
    if (!userId) {
      throw new UnauthorizedException('Usuário não autorizado');
    }
    return userId;
  }

  @Post()
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dds')
  create(@Body() createDdsDto: CreateDdsDto) {
    return this.ddsService.create(createDdsDto);
  }

  @Post('with-file')
  @Header('Deprecation', 'true')
  @Header('Sunset', 'Tue, 30 Jun 2026 00:00:00 GMT')
  @Header(
    'Warning',
    '299 - "Endpoint legado. Use POST /dds e POST /dds/:id/file."',
  )
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dds')
  createWithFile() {
    this.logger.warn({
      event: 'dds_legacy_with_file_used',
      blocked: true,
    });

    throw new GoneException(
      'O endpoint legado /dds/with-file foi removido. Use POST /dds para criar, PUT /dds/:id/signatures para assinaturas/fotos e POST /dds/:id/file para o PDF final.',
    );
  }

  @Get()
  @Authorize('can_view_dds')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('search') search?: string,
    @Query('kind') kind?: 'all' | 'model' | 'regular',
  ) {
    if (cursor) {
      return this.ddsService.findByCursor({
        cursor,
        limit: limit ? Number(limit) : 20,
        search,
        kind,
      });
    }

    return this.ddsService.findPaginated({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
      kind,
    });
  }

  @Get('export/all')
  @Authorize('can_view_dds')
  findAllForExport() {
    return this.ddsService.findAllForExport();
  }

  /** Lista IDs recentes para detecção anti-fraude de fotos (elimina N+1 no frontend) */
  @Get('historical-photo-hashes')
  @Authorize('can_view_dds')
  getHistoricalPhotoHashes(
    @Query('limit') limit?: string,
    @Query('exclude_id') excludeId?: string,
    @Query('company_id') companyId?: string,
  ) {
    return this.ddsService.getHistoricalPhotoHashes(
      limit ? Number(limit) : 100,
      excludeId,
      companyId,
    );
  }

  @Get('files/list')
  @Authorize('can_view_dds')
  listStoredFiles(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ) {
    return this.ddsService.listStoredFiles({
      companyId,
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
  }

  @Get('files/weekly-bundle')
  @Authorize('can_view_dds')
  async getWeeklyBundle(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.ddsService.getWeeklyBundle({
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
  @Authorize('can_view_dds')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ddsService.findOne(id);
  }

  /** Retorna URL assinada (S3) ou null do PDF armazenado */
  @Get(':id/pdf')
  @Authorize('can_view_dds')
  async getPdfAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    try {
      await this.pdfRateLimitService.checkDownloadLimit(
        this.getAuthenticatedUserIdOrThrow(req),
        this.getRequestIp(req),
      );
    } catch (error) {
      throw new UnauthorizedException(this.getRequestErrorMessage(error));
    }
    return this.ddsService.getPdfAccess(id);
  }

  @Get(':id/videos')
  @Authorize('can_view_dds')
  listVideoAttachments(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ddsService.listVideoAttachments(id);
  }

  @Get(':id/videos/:attachmentId/access')
  @Authorize('can_view_dds')
  getVideoAttachmentAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    return this.ddsService.getVideoAttachmentAccess(
      id,
      attachmentId,
      this.getRequestUserId(req),
    );
  }

  @Put(':id/signatures')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dds')
  replaceSignatures(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceDdsSignaturesDto,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    return this.ddsService.replaceSignatures(
      id,
      dto,
      this.getAuthenticatedUserIdOrThrow(req),
    );
  }

  /** Anexa PDF a um DDS existente */
  @Post(':id/file')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dds')
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  async attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const pdfFile = await assertUploadedPdf(file);
    try {
      return await this.ddsService.attachPdf(id, pdfFile);
    } finally {
      await cleanupUploadedTempFile(pdfFile);
    }
  }

  @Post(':id/videos')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dds')
  @UseInterceptors(FileInterceptor('file', createGovernedVideoUploadOptions()))
  async uploadVideoAttachment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const videoFile = await assertUploadedVideo(
      file,
      'Arquivo de vídeo não enviado.',
    );
    try {
      return await this.ddsService.uploadVideoAttachment(
        id,
        {
          buffer: await readUploadedFileBuffer(videoFile),
          originalName: videoFile.originalname,
          mimeType: videoFile.mimetype,
        },
        this.getRequestUserId(req),
      );
    } finally {
      await cleanupUploadedTempFile(videoFile);
    }
  }

  @Delete(':id/videos/:attachmentId')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dds')
  removeVideoAttachment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    return this.ddsService.removeVideoAttachment(
      id,
      attachmentId,
      this.getRequestUserId(req),
    );
  }

  /** Avança o status do DDS no workflow (rascunho → publicado → auditado → arquivado) */
  @Patch(':id/status')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_dds')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('status') status: DdsStatus,
  ) {
    if (!Object.values(DdsStatus).includes(status)) {
      throw new BadRequestException(`Status inválido: ${status}`);
    }
    return this.ddsService.updateStatus(id, status);
  }

  @Patch(':id')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dds')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateDdsDto: UpdateDdsDto,
  ) {
    return this.ddsService.update(id, updateDdsDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_dds')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ddsService.remove(id);
  }
}
