import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { defaultJobOptions } from '../queue/default-job-options';
import { MailService } from './mail.service';

type MailDlqPayload = {
  originalQueue: string;
  originalJobId?: string;
  originalJobName: string;
  attemptsMade: number;
  companyId?: string;
  data: unknown;
  error: {
    message: string;
    stack?: string;
  };
  failedAt: string;
};

type MailDlqJobState = 'wait' | 'failed';

export type ListMailDlqInput = {
  currentCompanyId?: string;
  isSuperAdmin?: boolean;
  page?: number;
  pageSize?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getString = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
};

const getRecipient = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }

  return getString(value, 'email') || getString(value, 'to') || null;
};

@Injectable()
export class MailDlqService {
  private readonly logger = new Logger(MailDlqService.name);

  constructor(
    @InjectQueue('mail') private readonly mailQueue: Queue,
    @InjectQueue('mail-dlq') private readonly mailDlqQueue: Queue,
    private readonly mailService: MailService,
  ) {}

  async list(input: ListMailDlqInput) {
    const page = Math.max(input.page || 1, 1);
    const pageSize = Math.min(Math.max(input.pageSize || 20, 1), 100);

    const counts = await this.mailDlqQueue.getJobCounts('wait', 'failed');
    const waitJobs = await this.mailDlqQueue.getJobs(
      ['wait'],
      0,
      counts.wait,
      true,
    );
    const failedJobs = await this.mailDlqQueue.getJobs(
      ['failed'],
      0,
      counts.failed,
      true,
    );

    const allJobs = [
      ...waitJobs.map((job) => ({ job, state: 'wait' as const })),
      ...failedJobs.map((job) => ({ job, state: 'failed' as const })),
    ];

    const visibleJobs = allJobs
      .map(({ job, state }) => this.mapJob(job, state))
      .filter((job) =>
        this.canAccessCompany(
          job.companyId || undefined,
          input.currentCompanyId,
          input.isSuperAdmin,
        ),
      )
      .sort((left, right) => {
        const leftTs = left.failedAt ? new Date(left.failedAt).getTime() : 0;
        const rightTs = right.failedAt ? new Date(right.failedAt).getTime() : 0;
        return rightTs - leftTs;
      });

    const total = visibleJobs.length;
    const skip = (page - 1) * pageSize;

    return {
      provider: this.mailService.getConfiguredProvider(),
      counts: {
        waiting: visibleJobs.filter((job) => job.state === 'wait').length,
        failed: visibleJobs.filter((job) => job.state === 'failed').length,
        total,
      },
      pagination: {
        page,
        pageSize,
        total,
        lastPage: total === 0 ? 1 : Math.ceil(total / pageSize),
      },
      items: visibleJobs.slice(skip, skip + pageSize),
    };
  }

  async retry(
    jobId: string,
    input: {
      currentCompanyId?: string;
      isSuperAdmin?: boolean;
      actorId?: string;
    },
  ) {
    const job = await this.mailDlqQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Job de e-mail não encontrado no DLQ.');
    }

    const payload = this.parsePayload(job);
    if (
      !this.canAccessCompany(
        payload.companyId,
        input.currentCompanyId,
        input.isSuperAdmin,
      )
    ) {
      throw new ForbiddenException(
        'Você não possui permissão para reenfileirar este job de e-mail.',
      );
    }

    if (!this.mailService.hasConfiguredProvider()) {
      throw new ServiceUnavailableException(
        'Nenhum provedor de e-mail está configurado no runtime atual.',
      );
    }

    if (
      payload.originalJobName !== 'send-document' &&
      payload.originalJobName !== 'send-file-key'
    ) {
      throw new BadRequestException(
        `Tipo de job não suportado para retry: ${payload.originalJobName}`,
      );
    }

    const retryData = this.withCompanyId(payload.data, payload.companyId);
    const retriedJob = await this.mailQueue.add(
      payload.originalJobName,
      retryData,
      defaultJobOptions,
    );
    await job.remove();

    this.logger.warn({
      event: 'mail_dlq_retry_requested',
      actorId: input.actorId || null,
      dlqJobId: job.id,
      retriedJobId: retriedJob.id,
      originalJobName: payload.originalJobName,
      companyId: payload.companyId || null,
      recipient: getRecipient(retryData),
    });

    return {
      message: 'Job de e-mail reenfileirado com sucesso.',
      dlqJobId: String(job.id),
      retriedJobId: String(retriedJob.id),
      originalJobName: payload.originalJobName,
      provider: this.mailService.getConfiguredProvider(),
    };
  }

  private mapJob(job: Job<unknown, unknown, string>, state: MailDlqJobState) {
    const payload = this.parsePayload(job);
    const data = isRecord(payload.data) ? payload.data : {};

    return {
      jobId: String(job.id),
      state,
      queue: 'mail-dlq',
      originalQueue: payload.originalQueue,
      originalJobId: payload.originalJobId || null,
      originalJobName: payload.originalJobName,
      attemptsMade: payload.attemptsMade,
      companyId: payload.companyId || null,
      recipient: getRecipient(payload.data),
      documentId: getString(data, 'documentId') || null,
      documentType: getString(data, 'documentType') || null,
      fileKey: getString(data, 'fileKey') || null,
      failedAt: payload.failedAt,
      errorMessage: payload.error.message,
    };
  }

  private parsePayload(job: Job<unknown, unknown, string>): MailDlqPayload {
    const raw = job.data;
    if (!isRecord(raw)) {
      throw new BadRequestException('Payload inválido no job do mail DLQ.');
    }

    const originalQueue = getString(raw, 'originalQueue');
    const originalJobName = getString(raw, 'originalJobName');
    const failedAt = getString(raw, 'failedAt');
    const attemptsMadeValue = raw.attemptsMade;
    const errorValue = raw.error;

    if (
      !originalQueue ||
      !originalJobName ||
      !failedAt ||
      !isRecord(errorValue)
    ) {
      throw new BadRequestException('Payload incompleto no job do mail DLQ.');
    }

    const errorMessage = getString(errorValue, 'message');
    if (!errorMessage) {
      throw new BadRequestException(
        'Erro original ausente no job do mail DLQ.',
      );
    }

    return {
      originalQueue,
      originalJobId: getString(raw, 'originalJobId'),
      originalJobName,
      attemptsMade:
        typeof attemptsMadeValue === 'number' &&
        Number.isFinite(attemptsMadeValue)
          ? attemptsMadeValue
          : 0,
      companyId: getString(raw, 'companyId'),
      data: raw.data,
      error: {
        message: errorMessage,
        stack: getString(errorValue, 'stack'),
      },
      failedAt,
    };
  }

  private withCompanyId(data: unknown, companyId?: string): unknown {
    if (!companyId || !isRecord(data) || getString(data, 'companyId')) {
      return data;
    }

    return {
      ...data,
      companyId,
    };
  }

  private canAccessCompany(
    jobCompanyId: string | undefined,
    currentCompanyId: string | undefined,
    isSuperAdmin?: boolean,
  ): boolean {
    if (isSuperAdmin) {
      return true;
    }

    if (!jobCompanyId || !currentCompanyId) {
      return false;
    }

    return jobCompanyId === currentCompanyId;
  }
}
