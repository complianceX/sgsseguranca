import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Request,
  UseInterceptors,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';

@Controller('reports')
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantInterceptor)
export class ReportsController {
  constructor(
    @InjectQueue('pdf-generation') private readonly pdfQueue: Queue,
  ) {}

  @Get('monthly')
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
    const companyId = req.user.company_id;
    const userId = req.user.userId;
    const job = await this.pdfQueue.add('generate', {
      reportType: 'monthly',
      params: { companyId, year, month },
      userId,
      companyId,
    });
    return { jobId: job.id, statusUrl: `/reports/status/${job.id}` };
  }

  @Get('status/:jobId')
  async getStatus(@Param('jobId') jobId: string) {
    const job = await this.pdfQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException();
    }
    const state = await job.getState();
    return { state, result: job.returnvalue ?? null };
  }
}
