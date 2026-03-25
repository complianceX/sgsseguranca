import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  UnauthorizedException,
  ParseUUIDPipe,
  StreamableFile,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuditsService } from './audits.service';
import { CreateAuditDto, UpdateAuditDto } from './dto/create-audit.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantService } from '../common/tenant/tenant.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';
import { AuditAction as ForensicAuditAction } from '../common/decorators/audit-action.decorator';
import {
  assertUploadedPdf,
  cleanupUploadedTempFile,
  createGovernedPdfUploadOptions,
} from '../common/interceptors/file-upload.interceptor';

@Controller('audits')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class AuditsController {
  private getRequestUserId(
    req: ExpressRequest & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ): string | undefined {
    return req.user?.userId ?? req.user?.id ?? req.user?.sub;
  }

  constructor(
    private readonly auditsService: AuditsService,
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
  @Authorize('can_manage_audits')
  create(@Body() createAuditDto: CreateAuditDto) {
    return this.auditsService.create(createAuditDto, this.getTenantIdOrThrow());
  }

  @Get()
  @Authorize('can_view_audits')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.auditsService.findPaginated(
      {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
        search: search || undefined,
      },
      this.getTenantIdOrThrow(),
    );
  }

  @Get('files/list')
  @Authorize('can_view_audits')
  listStoredFiles(@Query('year') year?: string, @Query('week') week?: string) {
    return this.auditsService.listStoredFiles({
      companyId: this.getTenantIdOrThrow(),
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
  }

  @Get('files/weekly-bundle')
  @Authorize('can_view_audits')
  async getWeeklyBundle(
    @Query('year') year?: string,
    @Query('week') week?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.auditsService.getWeeklyBundle({
      companyId: this.getTenantIdOrThrow(),
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });

    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${fileName}"`,
      type: 'application/pdf',
    });
  }

  @Get(':id')
  @Authorize('can_view_audits')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.auditsService.findOne(id, this.getTenantIdOrThrow());
  }

  @Get(':id/pdf')
  @Authorize('can_view_audits')
  getPdfAccess(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.auditsService.getPdfAccess(id, this.getTenantIdOrThrow());
  }

  @Post(':id/file')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_audits')
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  async attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Request()
    req: ExpressRequest & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    const pdfFile = await assertUploadedPdf(file);

    try {
      return await this.auditsService.attachPdf(
        id,
        this.getTenantIdOrThrow(),
        pdfFile,
        this.getRequestUserId(req),
      );
    } finally {
      await cleanupUploadedTempFile(pdfFile);
    }
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_audits')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateAuditDto: UpdateAuditDto,
  ) {
    return this.auditsService.update(
      id,
      updateAuditDto,
      this.getTenantIdOrThrow(),
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_audits')
  @ForensicAuditAction('delete', 'audit')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.auditsService.remove(id, this.getTenantIdOrThrow());
  }
}
