import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { TenantOptional } from '../common/decorators/tenant-optional.decorator';
import { withDefaultJobOptions } from '../queue/default-job-options';
import { TenantRestoreDto } from './dto/tenant-restore.dto';
import { TenantBackupService } from './tenant-backup.service';
import type { TenantBackupJobData } from './tenant-backup.types';

type RequestUser = {
  user?: {
    userId?: string;
    id?: string;
    sub?: string;
  };
};

const tenantBackupJobOptions = withDefaultJobOptions({
  timeout: 30 * 60 * 1000,
});

@Controller('admin')
@TenantOptional()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_GERAL)
export class TenantBackupAdminController {
  constructor(
    private readonly tenantBackupService: TenantBackupService,
    @InjectQueue('tenant-backup') private readonly tenantBackupQueue: Queue,
  ) {}

  @Post('tenants/:id/backup')
  async triggerTenantBackup(
    @Param('id') companyId: string,
    @Req() req: RequestUser,
  ) {
    const requestedByUserId = this.resolveRequestUserId(req);
    const data: TenantBackupJobData = {
      type: 'backup_tenant',
      companyId,
      triggerSource: 'manual',
      requestedByUserId: requestedByUserId || undefined,
    };

    try {
      const job = await this.tenantBackupQueue.add(
        'backup-tenant',
        data,
        tenantBackupJobOptions,
      );

      return {
        job_id: String(job.id),
        queue: this.tenantBackupService.getQueueName(),
        status_url: `/admin/jobs/${job.id}/status`,
      };
    } catch {
      const result = await this.tenantBackupService.backupTenant(companyId, {
        triggerSource: 'manual',
        requestedByUserId: requestedByUserId || undefined,
      });
      return {
        mode: 'inline',
        result,
      };
    }
  }

  @Get('tenants/:id/backups')
  listTenantBackups(@Param('id') companyId: string) {
    return this.tenantBackupService.listBackups(companyId);
  }

  @Post('tenants/:id/restore')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname || '') || '.json.gz';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: {
        fileSize: 1024 * 1024 * 200,
      },
    }),
  )
  async restoreTenantBackup(
    @Param('id') sourceCompanyId: string,
    @Body() body: TenantRestoreDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: RequestUser,
  ) {
    const hasUpload = Boolean(file?.path);
    if (!body.backup_id && !hasUpload) {
      throw new BadRequestException(
        'Informe backup_id ou envie o arquivo de backup para restore.',
      );
    }
    if (body.mode === 'clone_to_new_tenant' && !body.target_company_id) {
      throw new BadRequestException(
        'target_company_id é obrigatório para clone_to_new_tenant.',
      );
    }

    const requestedByUserId = this.resolveRequestUserId(req);
    const restoreInput: TenantBackupJobData & { type: 'restore_tenant' } = {
      type: 'restore_tenant',
      sourceCompanyId,
      mode: body.mode,
      targetCompanyId: body.target_company_id,
      backupId: body.backup_id,
      backupFilePath: file?.path,
      requestedByUserId: requestedByUserId || undefined,
      confirmCompanyId: body.confirm_company_id,
      confirmPhrase: body.confirm_phrase,
      targetCompanyName: body.target_company_name,
      targetCompanyCnpj: body.target_company_cnpj,
    };

    if (hasUpload) {
      const result = await this.tenantBackupService.restoreBackup({
        sourceCompanyId,
        mode: body.mode,
        targetCompanyId: body.target_company_id,
        backupId: body.backup_id,
        backupFilePath: file?.path,
        requestedByUserId: requestedByUserId || undefined,
        confirmCompanyId: body.confirm_company_id,
        confirmPhrase: body.confirm_phrase,
        targetCompanyName: body.target_company_name,
        targetCompanyCnpj: body.target_company_cnpj,
      });

      return {
        mode: 'inline',
        result,
      };
    }

    try {
      const job = await this.tenantBackupQueue.add(
        'restore-tenant',
        restoreInput,
        tenantBackupJobOptions,
      );
      return {
        job_id: String(job.id),
        queue: this.tenantBackupService.getQueueName(),
        status_url: `/admin/jobs/${job.id}/status`,
      };
    } catch {
      const result = await this.tenantBackupService.restoreBackup({
        sourceCompanyId,
        mode: body.mode,
        targetCompanyId: body.target_company_id,
        backupId: body.backup_id,
        requestedByUserId: requestedByUserId || undefined,
        confirmCompanyId: body.confirm_company_id,
        confirmPhrase: body.confirm_phrase,
        targetCompanyName: body.target_company_name,
        targetCompanyCnpj: body.target_company_cnpj,
      });
      return {
        mode: 'inline',
        result,
      };
    }
  }

  @Get('jobs/:jobId/status')
  async getTenantBackupJobStatus(@Param('jobId') jobId: string) {
    const job = await this.tenantBackupQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} não encontrado.`);
    }

    const state = await job.getState();
    return {
      id: String(job.id),
      name: job.name,
      state,
      queue: this.tenantBackupService.getQueueName(),
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason || null,
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      finishedAt: job.finishedOn
        ? new Date(job.finishedOn).toISOString()
        : null,
      result: (job.returnvalue as unknown) ?? null,
    };
  }

  private resolveRequestUserId(req: RequestUser): string | null {
    return req.user?.userId || req.user?.id || req.user?.sub || null;
  }
}
