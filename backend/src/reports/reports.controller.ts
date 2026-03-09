import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Request,
  UseInterceptors,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { defaultJobOptions } from '../queue/default-job-options';
import { ReportsService } from './reports.service';
import { Authorize } from '../auth/authorize.decorator';
import { GenerateReportDto } from './dto/generate-report.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class ReportsController {
  constructor(
    @InjectQueue('pdf-generation') private readonly pdfQueue: Queue,
    private readonly reportsService: ReportsService,
  ) {}

  @Get()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_dashboard')
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
  ) {
    return this.reportsService.findPaginated({ page, limit });
  }

  @Post('generate')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_dashboard')
  generate(
    @Request() req: { user: { company_id: string; userId: string } },
    @Body() body: GenerateReportDto,
  ) {
    return this.enqueueMonthlyReport(
      req.user.company_id,
      req.user.userId,
      body.ano,
      body.mes,
    );
  }

  @Get('monthly')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_dashboard')
  async generateMonthlyReport(
    @Request() req: { user: { company_id: string; userId: string } },
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe)
    year: number,
    @Query(
      'month',
      new DefaultValuePipe(new Date().getMonth() + 1),
      ParseIntPipe,
    )
    month: number,
  ) {
    return this.enqueueMonthlyReport(
      req.user.company_id,
      req.user.userId,
      year,
      month,
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_dashboard')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.reportsService.remove(id);
  }

  private async enqueueMonthlyReport(
    companyId: string,
    userId: string,
    year: number,
    month: number,
  ) {
    const job = await this.pdfQueue.add(
      'generate',
      {
        reportType: 'monthly',
        params: { companyId, year, month },
        userId,
        companyId,
      },
      defaultJobOptions,
    );
    return { jobId: job.id, statusUrl: `/reports/status/${job.id}` };
  }

  @Get('status/:jobId')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_dashboard')
  async getStatus(@Param('jobId') jobId: string) {
    const job = await this.pdfQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException();
    }
    const state = await job.getState();
    return { state, result: job.returnvalue ?? null };
  }

  @Get(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_dashboard')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.reportsService.findOne(id);
  }
}
