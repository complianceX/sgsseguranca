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
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { withDefaultJobOptions } from '../queue/default-job-options';
import { ReportsService } from './reports.service';
import { Authorize } from '../auth/authorize.decorator';
import { GenerateReportDto } from './dto/generate-report.dto';
import { getPdfQueueJobTimeoutMs } from '../common/services/pdf-runtime-config';

type ReportQueueJobParams = {
  month?: number;
  year?: number;
};

type ReportQueueJobData = {
  companyId?: string;
  userId?: string;
  reportType?: string;
  params?: ReportQueueJobParams;
};

const pdfJobOptions = withDefaultJobOptions({
  timeout: getPdfQueueJobTimeoutMs(),
});

@Controller('reports')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

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
      pdfJobOptions,
    );
    return { jobId: job.id, statusUrl: `/reports/status/${job.id}` };
  }

  @Get('status/:jobId')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_dashboard')
  async getStatus(
    @Param('jobId') jobId: string,
    @Request()
    req: { user: { company_id?: string; companyId?: string; userId?: string } },
  ) {
    const job = await this.pdfQueue.getJob(jobId);
    if (!job || !this.isJobVisibleToRequest(job, req.user)) {
      throw new NotFoundException();
    }
    const state = await job.getState();
    return { state, result: this.getJobResult(job) };
  }

  @Get('queue/stats')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_dashboard')
  async getQueueStats(
    @Request()
    req: {
      user: { company_id?: string; companyId?: string; userId?: string };
    },
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
      total: Object.values(counts).reduce(
        (sum, value) => sum + Number(value || 0),
        0,
      ),
    };
  }

  @Get('jobs')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_dashboard')
  async listJobs(
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
    @Request()
    req: { user: { company_id?: string; companyId?: string; userId?: string } },
  ) {
    const safeLimit = Math.max(1, Math.min(limit, 30));
    const jobs = await this.getVisibleJobsForRequest(req.user, safeLimit);

    const items = jobs.map(({ job, state }) => {
      const jobData = this.getJobData(job);

      return {
        id: String(job.id),
        name: job.name,
        state,
        createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
        finishedAt: job.finishedOn
          ? new Date(job.finishedOn).toISOString()
          : null,
        failedReason: job.failedReason || null,
        attemptsMade: job.attemptsMade,
        reportType: jobData?.reportType || null,
        month: jobData?.params?.month ?? null,
        year: jobData?.params?.year ?? null,
        result: this.getJobResult(job),
      };
    });

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

    const tenantCompanyId = user.company_id || user.companyId;
    if (tenantCompanyId) {
      const ignoredWithoutCompanyId = visible.filter(
        ({ job }) => !this.getJobData(job)?.companyId,
      ).length;
      if (ignoredWithoutCompanyId > 0) {
        this.logger.debug(
          `[reports-queue] ${ignoredWithoutCompanyId} job(s) ignorado(s) por não possuírem companyId. O filtro multi-tenant foi mantido.`,
        );
      }
    }

    const filtered = visible
      .filter(({ job }) => this.isJobVisibleToRequest(job, user))
      .sort(
        (left, right) => (right.job.timestamp || 0) - (left.job.timestamp || 0),
      );

    if (typeof limit === 'number') {
      return filtered.slice(0, limit);
    }

    return filtered;
  }

  private isJobVisibleToRequest(
    job: {
      data?: unknown;
    },
    user: { company_id?: string; companyId?: string; userId?: string },
  ) {
    const jobData = this.getJobData(job);
    const tenantCompanyId = user.company_id || user.companyId;
    if (tenantCompanyId) {
      return jobData?.companyId === tenantCompanyId;
    }

    if (user.userId) {
      return jobData?.userId === user.userId;
    }

    throw new ForbiddenException(
      'Contexto de tenant não resolvido para consultar a fila.',
    );
  }

  private getJobResult(job: { returnvalue?: unknown }) {
    return job.returnvalue ?? null;
  }

  private getJobData(job: { data?: unknown }): ReportQueueJobData | null {
    if (!job.data || typeof job.data !== 'object') {
      return null;
    }

    const data = job.data as Record<string, unknown>;
    const params =
      data.params && typeof data.params === 'object'
        ? (data.params as Record<string, unknown>)
        : null;

    return {
      companyId:
        typeof data.companyId === 'string' ? data.companyId : undefined,
      userId: typeof data.userId === 'string' ? data.userId : undefined,
      reportType:
        typeof data.reportType === 'string' ? data.reportType : undefined,
      params: params
        ? {
            month: typeof params.month === 'number' ? params.month : undefined,
            year: typeof params.year === 'number' ? params.year : undefined,
          }
        : undefined,
    };
  }
}
