import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';

type DlqName = 'pdf-generation-dlq' | 'mail-dlq' | 'document-import-dlq';

type DlqPolicy = {
  maxWaiting: number;
  pruneBatch: number;
};

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function policyFor(queue: DlqName): DlqPolicy {
  // Defaults are intentionally conservative to prevent Redis growth
  // while preserving enough forensic history in Bull Board.
  const defaultMaxWaiting = 2000;
  const defaultBatch = 200;

  const maxWaiting = readPositiveIntEnv(
    `DLQ_${queue.toUpperCase().replace(/-/g, '_')}_MAX_WAITING`,
    readPositiveIntEnv('DLQ_MAX_WAITING', defaultMaxWaiting),
  );
  const pruneBatch = Math.min(
    Math.max(readPositiveIntEnv('DLQ_PRUNE_BATCH', defaultBatch), 25),
    1000,
  );

  return {
    maxWaiting: Math.min(Math.max(maxWaiting, 100), 100_000),
    pruneBatch,
  };
}

@Injectable()
export class DlqRetentionService {
  private readonly logger = new Logger(DlqRetentionService.name);

  constructor(
    @InjectQueue('pdf-generation-dlq') private readonly pdfDlq: Queue,
    @InjectQueue('mail-dlq') private readonly mailDlq: Queue,
    @InjectQueue('document-import-dlq') private readonly importDlq: Queue,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async pruneDlqs(): Promise<void> {
    // Best-effort. DLQ retention must never crash the worker.
    await Promise.allSettled([
      this.pruneDlq('pdf-generation-dlq', this.pdfDlq),
      this.pruneDlq('mail-dlq', this.mailDlq),
      this.pruneDlq('document-import-dlq', this.importDlq),
    ]);
  }

  private async pruneDlq(name: DlqName, queue: Queue): Promise<void> {
    const { maxWaiting, pruneBatch } = policyFor(name);

    const counts = await queue.getJobCounts('wait', 'failed');
    const waiting = counts.wait ?? 0;

    if (waiting <= maxWaiting) {
      return;
    }

    const toRemove = waiting - maxWaiting;
    let removed = 0;
    let loops = 0;

    this.logger.warn({
      event: 'dlq_prune_started',
      queue: name,
      waiting,
      maxWaiting,
      toRemove,
      pruneBatch,
    });

    // We remove from the head of the wait list to prune oldest items first.
    while (removed < toRemove && loops < 1000) {
      loops += 1;
      const batch = Math.min(pruneBatch, toRemove - removed);

      const jobs = await queue.getJobs(['wait'], 0, batch - 1, true);
      if (jobs.length === 0) {
        break;
      }

      const results = await Promise.allSettled(jobs.map((job) => job.remove()));
      removed += results.filter((r) => r.status === 'fulfilled').length;
    }

    const after = await queue.getJobCounts('wait', 'failed');

    this.logger.warn({
      event: 'dlq_prune_finished',
      queue: name,
      removed,
      waitingAfter: after.wait ?? null,
      failedAfter: after.failed ?? null,
      maxWaiting,
    });
  }
}

