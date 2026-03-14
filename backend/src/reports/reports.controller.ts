import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
  async getStatus(
    @Param('jobId') jobId: string,
    @Request() req: { user: { company_id?: string; companyId?: string; userId?: string } },
  ) {
    const job = await this.pdfQueue.getJob(jobId);
    if (!job || !this.isJobVisibleToRequest(job, req.user)) {
      throw new NotFoundException();
    }
    const state = await job.getState();
    return { state, result: job.returnvalue ?? null };
  }

  @Get('queue/stats')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_dashboard')
  async getQueueStats(
    @Request() req: { user: { company_id?: string; companyId?: string; userId?: string } },
  ) {
    const jobs = await this.getVisibleJobsForRequest(req.user);
    const counts = jobs.reduce(
      (acc, job) => {
        switch (job.state) {
          case 'active':
            acc.active += 1;
            break;
          case 'waiting':
            acc.waiting += 1;
            break;
          case 'completed':
            acc.completed += 1;
            break;
          case 'failed':
            acc.failed += 1;
            break;
          case 'delayed':
            acc.delayed += 1;
            break;
          default:
            break;
        }
        return acc;
      },
      { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 },
    );

    return {
      active: counts.active,
      waiting: counts.waiting,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
      total: Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0),
    };
  }

  @Get('jobs')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_dashboard')
  async listJobs(
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
    @Request() req: { user: { company_id?: string; companyId?: string; userId?: string } },
  ) {
    const safeLimit = Math.max(1, Math.min(limit, 30));
    const jobs = await this.getVisibleJobsForRequest(req.user, safeLimit);

    const items = jobs.map(({ job, state }) => ({
      id: String(job.id),
      name: job.name,
      state,
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      failedReason: job.failedReason || null,
      attemptsMade: job.attemptsMade,
      reportType: job.data?.reportType || null,
      month: job.data?.params?.month || null,
      year: job.data?.params?.year || null,
      result: job.returnvalue ?? null,
    }));

    return { items };
  }

  @Get(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_dashboard')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.reportsService.findOne(id);
  }

  private async getVisibleJobsForRequest(
    user: { company_id?: string; companyId?: string; userId?: string },
    limit?: number,
  ) {
    const jobs = await this.pdfQueue.getJobs(
      ['active', 'wait', 'completed', 'failed', 'delayed'],
      0,
      -1,
      true,
    );

    const visible = await Promise.all(
      jobs.map(async (job) => ({
        job,
        state: await job.getState(),
      })),
    );

    const filtered = visible
      .filter(({ job }) => this.isJobVisibleToRequest(job, user))
      .sort((left, right) => (right.job.timestamp || 0) - (left.job.timestamp || 0));

    if (typeof limit === 'number') {
      return filtered.slice(0, limit);
    }

    return filtered;
  }

  private isJobVisibleToRequest(
    job: {
      data?: { companyId?: string; userId?: string };
    },
    user: { company_id?: string; companyId?: string; userId?: string },
  ) {
    const tenantCompanyId = user.company_id || user.companyId;
    if (tenantCompanyId) {
      return job.data?.companyId === tenantCompanyId;
    }

    if (user.userId) {
      return job.data?.userId === user.userId;
    }

    throw new ForbiddenException('Contexto de tenant não resolvido para consultar a fila.');
  }
}
