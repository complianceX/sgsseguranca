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
} from '@nestjs/common';
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

  @Get(':id')
  @Authorize('can_view_apr')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    // Check rate limit for mass data access/PDF generation
    try {
      if (req.user && req.user.id) {
        await this.pdfRateLimitService.checkDownloadLimit(req.user.id, req.ip);
      }
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
    return this.aprsService.findOne(id);
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
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() updateAprDto: UpdateAprDto) {
    return this.aprsService.update(id, updateAprDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_create_apr')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.aprsService.remove(id);
  }
}
