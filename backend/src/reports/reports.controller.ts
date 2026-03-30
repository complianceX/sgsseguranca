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
import { AuditAction as ForensicAuditAction } from '../common/decorators/audit-action.decorator';
import { UserThrottle } from '../common/decorators/user-throttle.decorator';
import { TenantThrottle } from '../common/decorators/tenant-throttle.decorator';

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

const QUEUE_LIST_DEFAULT_PAGE = 1;
const QUEUE_LIST_DEFAULT_LIMIT = 12;
const QUEUE_LIST_MAX_LIMIT = 30;
const QUEUE_SCAN_MAX_PER_STATE = Number(
  process.env.REPORTS_QUEUE_SCAN_MAX_PER_STATE || 200,
);

type KnownQueueState = 'active' | 'wait' | 'completed' | 'failed' | 'delayed';
const QUEUE_STATES: KnownQueueState[] = [
  'active',
  'wait',
  'delayed',
  'failed',
  'completed',
];

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
  @ForensicAuditAction('delete', 'report')
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
  @UserThrottle({ requestsPerMinute: 60 })
  @TenantThrottle({ requestsPerMinute: 120, requestsPerHour: 120 * 60 })
  async getQueueStats(
    @Request()
    req: {
      user: { company_id?: string; companyId?: string; userId?: string };
    },
  ) {
    // Importante: BullMQ não oferece contagem por tenant. Fazer dump completo é
    // um vetor de colapso (Redis-heavy). Aqui usamos um "scan limitado" por
    // estado e devolvemos apenas métricas aproximadas do tenant, com transparência.
    const scanned = await this.scanVisibleJobsForRequest(req.user, {
      maxPerState: this.getQueueScanMaxPerState(),
    });

    const counts = scanned.reduce(
      (acc, item) => {
        acc[item.state] += 1;
        return acc;
      },
      { active: 0, wait: 0, completed: 0, failed: 0, delayed: 0 } as Record<
        KnownQueueState,
        number
      >,
    );

    return {
      active: counts.active,
      waiting: counts.wait,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
      total:
        counts.active +
        counts.wait +
        counts.completed +
        counts.failed +
        counts.delayed,
      scannedMaxPerState: this.getQueueScanMaxPerState(),
      warning:
        'Stats são aproximados (scan limitado) para proteger Redis sob carga.',
    };
  }

  @Get('jobs')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_dashboard')
  @UserThrottle({ requestsPerMinute: 30 })
  @TenantThrottle({ requestsPerMinute: 60, requestsPerHour: 60 * 60 })
  async listJobs(
    @Query('page', new DefaultValuePipe(QUEUE_LIST_DEFAULT_PAGE), ParseIntPipe)
    page: number,
    @Query(
      'limit',
      new DefaultValuePipe(QUEUE_LIST_DEFAULT_LIMIT),
      ParseIntPipe,
    )
    limit: number,
    @Request()
    req: { user: { company_id?: string; companyId?: string; userId?: string } },
  ) {
    const safeLimit = Math.max(1, Math.min(limit, QUEUE_LIST_MAX_LIMIT));
    const safePage = Math.max(1, Math.min(page, 10_000));
    const offset = (safePage - 1) * safeLimit;

    // Evita `getJobs(0, -1)` e N+1 de `getState()`:
    // - buscamos apenas um subconjunto por estado (capado)
    // - filtramos por tenant
    // - ordenamos por timestamp e paginamos localmente
    const scanned = await this.scanVisibleJobsForRequest(req.user, {
      maxPerState: this.getQueueScanMaxPerState(),
    });
    scanned.sort(
      (left, right) => (right.job.timestamp || 0) - (left.job.timestamp || 0),
    );

    const totalApprox = scanned.length;
    const pageItems = scanned.slice(offset, offset + safeLimit);

    const items = pageItems.map(({ job, state }) => {
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

    return {
      items,
      page: safePage,
      limit: safeLimit,
      totalApprox,
      scannedMaxPerState: this.getQueueScanMaxPerState(),
      warning:
        'Lista é baseada em scan limitado (aprox.) para proteger Redis sob carga.',
    };
  }

  @Get(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_dashboard')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.reportsService.findOne(id);
  }

  private getQueueScanMaxPerState(): number {
    const parsed = Number(QUEUE_SCAN_MAX_PER_STATE);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 200;
    }
    return Math.min(Math.max(Math.floor(parsed), 25), 1000);
  }

  private async scanVisibleJobsForRequest(
    user: { company_id?: string; companyId?: string; userId?: string },
    options?: { maxPerState?: number },
  ) {
    const maxPerState = options?.maxPerState ?? this.getQueueScanMaxPerState();
    const stateFetchCount = Math.max(1, maxPerState);

    // Busca capada por estado para evitar dump total.
    const perState = await Promise.all(
      QUEUE_STATES.map(async (state) => {
        const jobs = await this.pdfQueue.getJobs(
          [state],
          0,
          stateFetchCount - 1,
          true,
        );
        return jobs.map((job) => ({ job, state }));
      }),
    );

    const visible = perState
      .flat()
      .filter(({ job }) => this.isJobVisibleToRequest(job, user));

    const tenantCompanyId = user.company_id || user.companyId;
    if (tenantCompanyId) {
      const ignoredWithoutCompanyId = visible.filter(({ job }) => {
        return !this.getJobData(job)?.companyId;
      }).length;
      if (ignoredWithoutCompanyId > 0) {
        this.logger.debug(
          `[reports-queue] ${ignoredWithoutCompanyId} job(s) ignorado(s) por não possuírem companyId. O filtro multi-tenant foi mantido.`,
        );
      }
    }

    return visible;
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
