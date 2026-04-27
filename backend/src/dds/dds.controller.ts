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
import { DdsApprovalService } from './dds-approval.service';
import { DdsObservabilityService } from './dds-observability.service';
import { DdsObservabilityAlertsService } from './dds-observability-alerts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantThrottle } from '../common/decorators/tenant-throttle.decorator';
import { CreateDdsDto } from './dto/create-dds.dto';
import { UpdateDdsDto } from './dto/update-dds.dto';
import { UpdateDdsAuditDto } from './dto/update-dds-audit.dto';
import { ReplaceDdsSignaturesDto } from './dto/replace-dds-signatures.dto';
import {
  DecideDdsApprovalDto,
  InitializeDdsApprovalFlowDto,
  ReopenDdsApprovalFlowDto,
} from './dto/dds-approval.dto';
import { PdfRateLimitService } from '../auth/services/pdf-rate-limit.service';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';
import { DdsStatus } from './entities/dds.entity';
import { AuditAction as ForensicAuditAction } from '../common/decorators/audit-action.decorator';
import {
  assertUploadedVideo,
  assertUploadedPdf,
  cleanupUploadedTempFile,
  createGovernedPdfUploadOptions,
  createGovernedVideoUploadOptions,
  readUploadedFileBuffer,
} from '../common/interceptors/file-upload.interceptor';
import { FileInspectionService } from '../common/security/file-inspection.service';

const parseTenantThrottle = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveHourlyTenantThrottle = (
  hourlyValue: string | undefined,
  perMinuteValue: number,
) => {
  const parsed = Number(hourlyValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return perMinuteValue * 60;
};

// Função para validar limites de rate limiting com máximos de segurança
const validateRateLimit = (
  value: string | undefined,
  fallback: number,
  max: number,
) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= max) {
    return parsed;
  }
  return Math.min(fallback, max);
};

const DDS_CREATE_TENANT_THROTTLE_LIMIT = parseTenantThrottle(
  process.env.DDS_CREATE_TENANT_THROTTLE_LIMIT,
  120,
);
const DDS_CREATE_TENANT_THROTTLE_HOUR_LIMIT = resolveHourlyTenantThrottle(
  process.env.DDS_CREATE_TENANT_THROTTLE_HOUR_LIMIT,
  DDS_CREATE_TENANT_THROTTLE_LIMIT,
);

const DDS_STATUS_TENANT_THROTTLE_LIMIT = parseTenantThrottle(
  process.env.DDS_STATUS_TENANT_THROTTLE_LIMIT,
  120,
);
const DDS_STATUS_TENANT_THROTTLE_HOUR_LIMIT = resolveHourlyTenantThrottle(
  process.env.DDS_STATUS_TENANT_THROTTLE_HOUR_LIMIT,
  DDS_STATUS_TENANT_THROTTLE_LIMIT,
);

const DDS_SIGNATURES_TENANT_THROTTLE_LIMIT = parseTenantThrottle(
  process.env.DDS_SIGNATURES_TENANT_THROTTLE_LIMIT,
  120,
);
const DDS_SIGNATURES_TENANT_THROTTLE_HOUR_LIMIT = resolveHourlyTenantThrottle(
  process.env.DDS_SIGNATURES_TENANT_THROTTLE_HOUR_LIMIT,
  DDS_SIGNATURES_TENANT_THROTTLE_LIMIT,
);

const DDS_UPLOAD_TENANT_THROTTLE_LIMIT = parseTenantThrottle(
  process.env.DDS_UPLOAD_TENANT_THROTTLE_LIMIT,
  60,
);
const DDS_UPLOAD_TENANT_THROTTLE_HOUR_LIMIT = resolveHourlyTenantThrottle(
  process.env.DDS_UPLOAD_TENANT_THROTTLE_HOUR_LIMIT,
  DDS_UPLOAD_TENANT_THROTTLE_LIMIT,
);

const DDS_VIDEO_UPLOAD_TENANT_THROTTLE_LIMIT = validateRateLimit(
  process.env.DDS_VIDEO_UPLOAD_TENANT_THROTTLE_LIMIT,
  10, // Reduzido para 10/min (era 30)
  20, // Máximo enforcement de 20/min
);
const DDS_VIDEO_UPLOAD_TENANT_THROTTLE_HOUR_LIMIT = resolveHourlyTenantThrottle(
  process.env.DDS_VIDEO_UPLOAD_TENANT_THROTTLE_HOUR_LIMIT,
  DDS_VIDEO_UPLOAD_TENANT_THROTTLE_LIMIT,
);

const DDS_APPROVAL_TENANT_THROTTLE_LIMIT = parseTenantThrottle(
  process.env.DDS_APPROVAL_TENANT_THROTTLE_LIMIT,
  30,
);
const DDS_APPROVAL_TENANT_THROTTLE_HOUR_LIMIT = resolveHourlyTenantThrottle(
  process.env.DDS_APPROVAL_TENANT_THROTTLE_HOUR_LIMIT,
  DDS_APPROVAL_TENANT_THROTTLE_LIMIT,
);

@Controller('dds')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@Roles(
  Role.ADMIN_GERAL,
  Role.ADMIN_EMPRESA,
  Role.TST,
  Role.SUPERVISOR,
  Role.COLABORADOR,
)
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

  private getRequestUserAgent(req: Request): string | null {
    const userAgent: unknown = req.headers['user-agent'];
    if (Array.isArray(userAgent)) {
      const firstUserAgent: unknown = (userAgent as unknown[])[0];
      return typeof firstUserAgent === 'string' &&
        firstUserAgent.trim().length > 0
        ? firstUserAgent
        : null;
    }
    return typeof userAgent === 'string' && userAgent.trim().length > 0
      ? userAgent
      : null;
  }

  constructor(
    private readonly ddsService: DdsService,
    private readonly ddsApprovalService: DdsApprovalService,
    private readonly ddsObservabilityService: DdsObservabilityService,
    private readonly ddsObservabilityAlertsService: DdsObservabilityAlertsService,
    private readonly pdfRateLimitService: PdfRateLimitService,
    private readonly fileInspectionService: FileInspectionService,
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
  @TenantThrottle({
    requestsPerMinute: DDS_CREATE_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DDS_CREATE_TENANT_THROTTLE_HOUR_LIMIT,
  })
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
  ) {
    return this.ddsService.getHistoricalPhotoHashes(
      limit ? Number(limit) : 100,
      excludeId,
    );
  }

  @Get('files/list')
  @Authorize('can_view_dds')
  listStoredFiles(@Query('year') year?: string, @Query('week') week?: string) {
    return this.ddsService.listStoredFiles({
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
  }

  @Get('files/weekly-bundle')
  @Authorize('can_view_dds')
  async getWeeklyBundle(
    @Query('year') year?: string,
    @Query('week') week?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.ddsService.getWeeklyBundle({
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });

    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${fileName}"`,
      type: 'application/pdf',
    });
  }

  /** Busca múltiplos DDSs por IDs (máximo 50) */
  @Get('batch')
  @Authorize('can_view_dds')
  findByIds(@Query('ids') ids?: string) {
    const parsedIds = (ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (parsedIds.length === 0) {
      throw new BadRequestException('Informe ao menos um ID no parâmetro ids.');
    }
    return this.ddsService.findByIds(parsedIds);
  }

  @Get('observability/overview')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_view_dds')
  getObservabilityOverview() {
    return this.ddsObservabilityService.getOverview();
  }

  @Get('observability/alerts')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_view_dds')
  getObservabilityAlertsPreview(
    @Req()
    req: Request & {
      user?: { companyId?: string };
    },
  ) {
    return this.ddsObservabilityAlertsService.getPreview(
      req.user?.companyId ?? null,
    );
  }

  @Post('observability/alerts/dispatch')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_dds')
  @ForensicAuditAction('update', 'dds_observability_alerts')
  dispatchObservabilityAlerts(
    @Req()
    req: Request & {
      user?: { companyId?: string };
    },
  ) {
    return this.ddsObservabilityAlertsService.dispatch(
      req.user?.companyId ?? null,
    );
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

  @Get(':id/validation-context')
  @Authorize('can_view_dds')
  getValidationContext(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ddsService.getValidationContext(id);
  }

  @Get(':id/approvals')
  @Authorize('can_view_dds')
  getApprovalFlow(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ddsApprovalService.getFlow(id);
  }

  @Post(':id/approvals/initialize')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_dds')
  @TenantThrottle({
    requestsPerMinute: DDS_APPROVAL_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DDS_APPROVAL_TENANT_THROTTLE_HOUR_LIMIT,
  })
  @ForensicAuditAction('update', 'dds_approval_flow')
  initializeApprovalFlow(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: InitializeDdsApprovalFlowDto,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    return this.ddsApprovalService.initializeFlow(id, dto, {
      userId: this.getAuthenticatedUserIdOrThrow(req),
      ip: this.getRequestIp(req),
      userAgent: this.getRequestUserAgent(req),
    });
  }

  @Post(':id/approvals/reopen')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_dds')
  @TenantThrottle({
    requestsPerMinute: DDS_APPROVAL_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DDS_APPROVAL_TENANT_THROTTLE_HOUR_LIMIT,
  })
  @ForensicAuditAction('update', 'dds_approval_flow')
  reopenApprovalFlow(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReopenDdsApprovalFlowDto,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    return this.ddsApprovalService.reopenFlow(id, dto.reason, {
      userId: this.getAuthenticatedUserIdOrThrow(req),
      ip: this.getRequestIp(req),
      userAgent: this.getRequestUserAgent(req),
      pin: dto.pin,
    });
  }

  @Post(':id/approvals/:approvalId/approve')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_dds')
  @TenantThrottle({
    requestsPerMinute: DDS_APPROVAL_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DDS_APPROVAL_TENANT_THROTTLE_HOUR_LIMIT,
  })
  @ForensicAuditAction('approve', 'dds_approval_flow')
  approveApprovalStep(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('approvalId', new ParseUUIDPipe()) approvalId: string,
    @Body() dto: DecideDdsApprovalDto,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    return this.ddsApprovalService.approveStep(id, approvalId, dto.reason, {
      userId: this.getAuthenticatedUserIdOrThrow(req),
      ip: this.getRequestIp(req),
      userAgent: this.getRequestUserAgent(req),
      pin: dto.pin,
    });
  }

  @Post(':id/approvals/:approvalId/reject')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_dds')
  @TenantThrottle({
    requestsPerMinute: DDS_APPROVAL_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DDS_APPROVAL_TENANT_THROTTLE_HOUR_LIMIT,
  })
  @ForensicAuditAction('reject', 'dds_approval_flow')
  rejectApprovalStep(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('approvalId', new ParseUUIDPipe()) approvalId: string,
    @Body() dto: DecideDdsApprovalDto,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    return this.ddsApprovalService.rejectStep(id, approvalId, dto.reason, {
      userId: this.getAuthenticatedUserIdOrThrow(req),
      ip: this.getRequestIp(req),
      userAgent: this.getRequestUserAgent(req),
      pin: dto.pin,
    });
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
  @TenantThrottle({
    requestsPerMinute: DDS_SIGNATURES_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DDS_SIGNATURES_TENANT_THROTTLE_HOUR_LIMIT,
  })
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

  @Get(':id/signatures')
  @Authorize('can_view_dds')
  listSignatures(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ddsService.listSignatures(id);
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
  @TenantThrottle({
    requestsPerMinute: DDS_UPLOAD_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DDS_UPLOAD_TENANT_THROTTLE_HOUR_LIMIT,
  })
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  async attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const pdfFile = await assertUploadedPdf(
      file,
      undefined,
      this.fileInspectionService,
    );
    try {
      return await this.ddsService.attachPdf(id, pdfFile, {
        userId: this.getAuthenticatedUserIdOrThrow(req),
        ip: this.getRequestIp(req),
        userAgent: this.getRequestUserAgent(req),
      });
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
  @TenantThrottle({
    requestsPerMinute: DDS_VIDEO_UPLOAD_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DDS_VIDEO_UPLOAD_TENANT_THROTTLE_HOUR_LIMIT,
  })
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
      this.fileInspectionService,
    );

    // Validação de tamanho ANTES de carregar na memória: máximo 500MB
    const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
    if (videoFile.size > MAX_VIDEO_SIZE) {
      await cleanupUploadedTempFile(videoFile);
      throw new BadRequestException(
        `Vídeo excede tamanho máximo de 500MB. Tamanho atual: ${Math.round(videoFile.size / 1024 / 1024)}MB`,
      );
    }

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
  @ForensicAuditAction('delete', 'dds_video_attachment')
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
  @TenantThrottle({
    requestsPerMinute: DDS_STATUS_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DDS_STATUS_TENANT_THROTTLE_HOUR_LIMIT,
  })
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

  /** Cria DDS operacional a partir de um template */
  @Post(':id/operationalize')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dds')
  @TenantThrottle({
    requestsPerMinute: DDS_CREATE_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DDS_CREATE_TENANT_THROTTLE_HOUR_LIMIT,
  })
  operationalizeTemplate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body()
    body?: {
      data?: string;
      facilitador_id?: string;
      site_id?: string;
    },
  ) {
    return this.ddsService.operationalizeTemplate(id, body ?? {});
  }

  /** Atualiza somente os campos de auditoria do DDS */
  @Patch(':id/audit')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_dds')
  updateAudit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDdsAuditDto,
  ) {
    return this.ddsService.updateAudit(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_dds')
  @ForensicAuditAction('delete', 'dds')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ddsService.remove(id);
  }
}
