import { Injectable, Logger } from '@nestjs/common';
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
export class AprMetricsService {
  private readonly logger = new Logger(AprMetricsService.name);

  constructor(
    @InjectRepository(AprMetric)
    private readonly repo: Repository<AprMetric>,
  ) {}

  record(data: CreateAprMetricDto): void {
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
        });
    });
  }
}
