import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
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
import {
  assertUploadedPdf,
  cleanupUploadedTempFile,
  createGovernedPdfUploadOptions,
} from '../common/interceptors/file-upload.interceptor';

@Controller('rdos')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class RdosController {
  constructor(
    private readonly rdosService: RdosService,
    private readonly pdfRateLimitService: PdfRateLimitService,
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
  findPaginated(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('site_id') siteId?: string,
    @Query('status') status?: string,
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
  ) {
    return this.rdosService.findPaginated({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      site_id: siteId || undefined,
      status: status || undefined,
      data_inicio: dataInicio || undefined,
      data_fim: dataFim || undefined,
    });
  }

  @Get('files/list')
  @Authorize('can_view_rdos')
  listStoredFiles(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ) {
    return this.rdosService.listFiles({
      companyId,
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
  }

  @Get('files/weekly-bundle')
  @Authorize('can_view_rdos')
  async getWeeklyBundle(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.rdosService.getWeeklyBundle({
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
  sign(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: SignRdoDto) {
    return this.rdosService.sign(id, body);
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
    const pdfFile = await assertUploadedPdf(file);
    try {
      return await this.rdosService.savePdf(id, pdfFile);
    } finally {
      await cleanupUploadedTempFile(pdfFile);
    }
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
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rdosService.remove(id);
  }
}
