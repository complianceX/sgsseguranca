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
  Req,
  Query,
  UnauthorizedException,
  Header,
  StreamableFile,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AprsService } from './aprs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CreateAprDto } from './dto/create-apr.dto';
import { UpdateAprDto } from './dto/update-apr.dto';
import { PdfRateLimitService } from '../auth/services/pdf-rate-limit.service';
import { AprListItemDto } from './dto/apr-list-item.dto';
import { Authorize } from '../auth/authorize.decorator';

@Controller('aprs')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class AprsController {
  constructor(
    private readonly aprsService: AprsService,
    private readonly pdfRateLimitService: PdfRateLimitService,
  ) {}

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.COLABORADOR)
  @Authorize('can_create_apr')
  create(@Body() createAprDto: CreateAprDto) {
    return this.aprsService.create(createAprDto);
  }

  @Get()
  @Authorize('can_view_apr')
  findPaginated(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('company_id') companyId?: string,
    @Query('is_modelo_padrao') isModeloPadrao?: string,
  ): Promise<{
    data: AprListItemDto[];
    total: number;
    page: number;
    lastPage: number;
  }> {
    return this.aprsService.findPaginated({
      page: Number(page),
      limit: Number(limit),
      search: search || undefined,
      status: status || undefined,
      companyId: companyId || undefined,
      isModeloPadrao:
        isModeloPadrao === undefined ? undefined : isModeloPadrao === 'true',
    });
  }

  @Get('files/list')
  @Authorize('can_view_apr')
  listStoredFiles(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ) {
    return this.aprsService.listStoredFiles({
      companyId,
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
  }

  @Get('files/weekly-bundle')
  @Authorize('can_view_apr')
  async getWeeklyBundle(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.aprsService.getWeeklyBundle({
      companyId,
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${fileName}"`,
      type: 'application/pdf',
    });
  }

  @Get('export/excel')
  @Authorize('can_view_apr')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="aprs.xlsx"')
  async exportExcel(): Promise<StreamableFile> {
    const buffer = await this.aprsService.exportExcel();
    return new StreamableFile(buffer);
  }

  @Get('risks/matrix')
  @Authorize('can_view_apr')
  getRiskMatrix(@Query('site_id') siteId?: string) {
    return this.aprsService.getRiskMatrix(siteId || undefined);
  }

  @Post('risk-controls/suggestions')
  @Authorize('can_view_apr')
  getControlSuggestions(
    @Body()
    payload: {
      probability?: number;
      severity?: number;
      exposure?: number;
      activity?: string;
      condition?: string;
    },
  ) {
    return this.aprsService.getControlSuggestions(payload);
  }

  /** Analytics overview para o dashboard */
  @Get('analytics/overview')
  @Authorize('can_view_apr')
  getAnalyticsOverview() {
    return this.aprsService.getAnalyticsOverview();
  }

  @Get(':id')
  @Authorize('can_view_apr')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    try {
      if (req.user?.id) {
        await this.pdfRateLimitService.checkDownloadLimit(req.user.id, req.ip);
      }
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
    return this.aprsService.findOne(id);
  }

  /** Retorna URL assinada (S3) ou null do PDF armazenado */
  @Get(':id/pdf')
  @Authorize('can_view_apr')
  getPdfAccess(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.aprsService.getPdfAccess(id);
  }

  /** Histórico de ações/logs da APR */
  @Get(':id/logs')
  @Authorize('can_view_apr')
  getLogs(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.aprsService.getLogs(id);
  }

  /** Histórico de versões (todas as versões da mesma raiz) */
  @Get(':id/versions')
  @Authorize('can_view_apr')
  getVersionHistory(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.aprsService.getVersionHistory(id);
  }

  /** Anexa PDF a uma APR existente */
  @Post(':id/file')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR, Role.COLABORADOR)
  @Authorize('can_create_apr')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  async attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    const userId = req.user?.id || req.user?.sub;
    return this.aprsService.attachPdf(id, file, userId);
  }

  /** Aprova a APR — Pendente → Aprovada */
  @Post(':id/approve')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_create_apr')
  async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('reason') reason: string | undefined,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) throw new UnauthorizedException('Usuário não identificado');
    return this.aprsService.approve(id, userId, reason);
  }

  /** Reprova/Cancela a APR — Pendente → Cancelada */
  @Post(':id/reject')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_create_apr')
  async reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) throw new UnauthorizedException('Usuário não identificado');
    if (!reason) throw new BadRequestException('Motivo de reprovação obrigatório');
    return this.aprsService.reject(id, userId, reason);
  }

  /** Encerra a APR — Aprovada → Encerrada */
  @Post(':id/finalize')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_create_apr')
  async finalize(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) throw new UnauthorizedException('Usuário não identificado');
    return this.aprsService.finalize(id, userId);
  }

  /** Cria nova versão a partir de APR Aprovada */
  @Post(':id/new-version')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR, Role.COLABORADOR)
  @Authorize('can_create_apr')
  async createNewVersion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) throw new UnauthorizedException('Usuário não identificado');
    return this.aprsService.createNewVersion(id, userId);
  }

  @Patch(':id')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_create_apr')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateAprDto: UpdateAprDto,
  ) {
    return this.aprsService.update(id, updateAprDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_create_apr')
  remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    return this.aprsService.remove(id, req.user?.id);
  }
}
