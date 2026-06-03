import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AprMetric, AprMetricEventType } from '../entities/apr-metric.entity';

export class CreateAprMetricDto {
  aprId: string;
  tenantId?: string | null;
  eventType: AprMetricEventType;
  durationMs?: number | null;
  errorStep?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AprMetricsService implements OnModuleDestroy {
  private readonly logger = new Logger(AprMetricsService.name);
  private readonly pendingRecords = new Set<Promise<void>>();

  constructor(
    @InjectRepository(AprMetric)
    private readonly repo: Repository<AprMetric>,
  ) {}

  record(data: CreateAprMetricDto): void {
    const pendingRecord = new Promise<void>((resolve) => {
      setImmediate(() => {
        this.repo
          .save(
            this.repo.create({
              aprId: data.aprId,
              tenantId: data.tenantId ?? null,
              eventType: data.eventType,
              durationMs: data.durationMs ?? null,
              errorStep: data.errorStep ?? null,
              metadata: data.metadata ?? null,
            }),
          )
          .catch((err: unknown) => {
            this.logger.warn({
              event: 'apr_metric_record_failed',
              aprId: data.aprId,
              eventType: data.eventType,
              error: err instanceof Error ? err.message : String(err),
            });
          })
          .finally(resolve);
      });
    });

    this.pendingRecords.add(pendingRecord);
    void pendingRecord.finally(() => {
      this.pendingRecords.delete(pendingRecord);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pendingRecords.size === 0) {
      return;
    }

    await Promise.race([
      Promise.allSettled([...this.pendingRecords]),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
  }
}
