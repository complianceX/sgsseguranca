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
  BadRequestException,
  UploadedFile,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { PtsService } from './pts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CreatePtDto } from './dto/create-pt.dto';
import { UpdatePtDto } from './dto/update-pt.dto';
import { LogPreApprovalReviewDto } from './dto/log-pre-approval-review.dto';
import { UpdatePtApprovalRulesDto } from './dto/update-pt-approval-rules.dto';
import { ApprovePtDto } from './dto/approve-pt.dto';
import { RejectPtDto } from './dto/reject-pt.dto';
import { PtResponseDto, toPtResponseDto } from './dto/pt-response.dto';
import { PdfRateLimitService } from '../auth/services/pdf-rate-limit.service';
import { Authorize } from '../auth/authorize.decorator';
import {
  assertUploadedPdf,
  cleanupUploadedTempFile,
  createGovernedPdfUploadOptions,
} from '../common/interceptors/file-upload.interceptor';

@Controller('pts')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class PtsController {
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
    private readonly ptsService: PtsService,
    private readonly pdfRateLimitService: PdfRateLimitService,
  ) {}

  @Post()
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_pt')
  create(@Body() createPtDto: CreatePtDto): Promise<PtResponseDto> {
    return this.ptsService.create(createPtDto).then(toPtResponseDto);
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_approve_pt')
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ApprovePtDto,
    @Req() req: { user?: { userId?: string } },
  ): Promise<PtResponseDto> {
    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestException('Usuário autenticado inválido');
    }
    return this.ptsService
      .approve(id, userId, body.reason)
      .then(toPtResponseDto);
  }

  @Post(':id/pre-approval-review')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_approve_pt')
  logPreApprovalReview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: LogPreApprovalReviewDto,
    @Req() req: { user?: { userId?: string } },
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestException('Usuário autenticado inválido');
    }
    return this.ptsService.logPreApprovalReview(id, userId, payload);
  }

  @Get(':id/pre-approval-history')
  @Authorize('can_view_pt')
  getPreApprovalHistory(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ptsService.getPreApprovalHistory(id);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_approve_pt')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RejectPtDto,
    @Req() req: { user?: { userId?: string } },
  ): Promise<PtResponseDto> {
    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestException('Usuário autenticado inválido');
    }
    return this.ptsService
      .reject(id, userId, body.reason)
      .then(toPtResponseDto);
  }

  @Get()
  @Authorize('can_view_pt')
  findPaginated(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.ptsService.findPaginated({
      page: Number(page),
      limit: Number(limit),
      search: search || undefined,
      status: status || undefined,
    });
  }

  @Get('files/list')
  @Authorize('can_view_pt')
  listStoredFiles(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ) {
    return this.ptsService.listStoredFiles({
      companyId,
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
  }

  @Get('files/weekly-bundle')
  @Authorize('can_view_pt')
  async getWeeklyBundle(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.ptsService.getWeeklyBundle({
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
  @Authorize('can_view_pt')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="pts.xlsx"')
  async exportExcel(): Promise<StreamableFile> {
    const buffer = await this.ptsService.exportExcel();
    return new StreamableFile(buffer);
  }

  @Get('approval-rules')
  @Authorize('can_view_pt')
  getApprovalRules() {
    return this.ptsService.getApprovalRules();
  }

  @Get('analytics/overview')
  @Authorize('can_view_pt')
  getAnalyticsOverview() {
    return this.ptsService.getAnalyticsOverview();
  }

  @Patch('approval-rules')
  @Authorize('can_manage_pt')
  updateApprovalRules(@Body() payload: UpdatePtApprovalRulesDto) {
    return this.ptsService.updateApprovalRules(payload);
  }

  /** Retorna URL assinada (S3) ou null do PDF armazenado */
  @Get(':id/pdf')
  @Authorize('can_view_pt')
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

    return this.ptsService.getPdfAccess(id);
  }

  @Post(':id/finalize')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_approve_pt')
  finalize(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: { user?: { userId?: string } },
  ): Promise<PtResponseDto> {
    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestException('Usuário autenticado inválido');
    }
    return this.ptsService.finalize(id, userId).then(toPtResponseDto);
  }

  /** Anexa PDF a uma PT existente */
  @Post(':id/file')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_pt')
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  async attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    const pdfFile = await assertUploadedPdf(file);
    try {
      return await this.ptsService.attachPdf(
        id,
        pdfFile,
        this.getRequestUserId(req),
      );
    } finally {
      await cleanupUploadedTempFile(pdfFile);
    }
  }

  @Get(':id')
  @Authorize('can_view_pt')
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PtResponseDto> {
    return toPtResponseDto(await this.ptsService.findOne(id));
  }

  @Patch(':id')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_pt')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updatePtDto: UpdatePtDto,
  ): Promise<PtResponseDto> {
    return this.ptsService.update(id, updatePtDto).then(toPtResponseDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_pt')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ptsService.remove(id);
  }
}
