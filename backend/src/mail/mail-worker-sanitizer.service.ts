import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { MailService } from './mail.service';

const MAIL_DISABLED_PATTERN = /MAIL_ENABLED=false/i;
const SANITIZE_SCAN_LIMIT = 200;

type LooseRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is LooseRecord =>
  typeof value === 'object' && value !== null;

const getNestedString = (
  record: LooseRecord,
  outerKey: string,
  innerKey: string,
): string | null => {
  const outer = record[outerKey];
  if (!isRecord(outer)) {
    return null;
  }

  const value = outer[innerKey];
  return typeof value === 'string' ? value : null;
};

const getOptionalString = (
  record: LooseRecord,
  key: string,
): string | null => {
  const value = record[key];
  return typeof value === 'string' ? value : null;
};

@Injectable()
export class MailWorkerSanitizerService implements OnModuleInit {
  private readonly logger = new Logger(MailWorkerSanitizerService.name);

  constructor(
    @InjectQueue('mail') private readonly mailQueue: Queue,
    @InjectQueue('mail-dlq') private readonly mailDlqQueue: Queue,
    private readonly mailService: MailService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.sanitizeDisabledMailArtifacts('startup');
  }

  private isDisabledMailMessage(message: string | null | undefined): boolean {
    return typeof message === 'string' && MAIL_DISABLED_PATTERN.test(message);
  }

  private isDisabledFailedJob(job: Job<unknown, unknown, string>): boolean {
    return this.isDisabledMailMessage(job.failedReason);
  }

  private isDisabledDlqJob(job: Job<unknown, unknown, string>): boolean {
    if (!isRecord(job.data)) {
      return false;
    }

    const nestedErrorMessage = getNestedString(job.data, 'error', 'message');
    const directErrorMessage = getOptionalString(job.data, 'failedReason');
    return (
      this.isDisabledMailMessage(nestedErrorMessage) ||
      this.isDisabledMailMessage(directErrorMessage)
    );
  }

  private async loadJobs(
    queue: Queue,
    state: 'failed' | 'wait',
    count: number,
  ): Promise<Job<unknown, unknown, string>[]> {
    if (count <= 0) {
      return [];
    }

    return queue.getJobs([state], 0, Math.min(count, SANITIZE_SCAN_LIMIT) - 1);
  }

  async sanitizeDisabledMailArtifacts(trigger: 'startup' | 'manual') {
    if (this.mailService.isDeliveryEnabled()) {
      return;
    }

    const [mailCounts, dlqCounts] = await Promise.all([
      this.mailQueue.getJobCounts('failed'),
      this.mailDlqQueue.getJobCounts('wait', 'failed'),
    ]);

    const [failedJobs, waitingDlqJobs, failedDlqJobs] = await Promise.all([
      this.loadJobs(this.mailQueue, 'failed', mailCounts.failed || 0),
      this.loadJobs(this.mailDlqQueue, 'wait', dlqCounts.wait || 0),
      this.loadJobs(this.mailDlqQueue, 'failed', dlqCounts.failed || 0),
    ]);

    const failedJobsToRemove = failedJobs.filter((job) =>
      this.isDisabledFailedJob(job),
    );
    const dlqJobsToRemove = [...waitingDlqJobs, ...failedDlqJobs].filter((job) =>
      this.isDisabledDlqJob(job),
    );

    await Promise.all([
      ...failedJobsToRemove.map((job) => job.remove()),
      ...dlqJobsToRemove.map((job) => job.remove()),
    ]);

    if (!failedJobsToRemove.length && !dlqJobsToRemove.length) {
      return;
    }

    this.logger.warn({
      event: 'mail_disabled_queue_artifacts_sanitized',
      trigger,
      removedFailedJobs: failedJobsToRemove.length,
      removedDlqJobs: dlqJobsToRemove.length,
    });
  }
}
