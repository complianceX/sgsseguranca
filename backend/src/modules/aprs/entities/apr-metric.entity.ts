import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

export enum AprMetricEventType {
  APR_OPENED = 'APR_OPENED',
  APR_SAVED = 'APR_SAVED',
  APR_PDF_GENERATED = 'APR_PDF_GENERATED',
  APR_APPROVED = 'APR_APPROVED',
  APR_REJECTED = 'APR_REJECTED',
  APR_STEP_ERROR = 'APR_STEP_ERROR',
}

@Entity('apr_metrics')
@Index('IDX_apr_metrics_apr_id', ['aprId'])
@Index('IDX_apr_metrics_tenant_event', ['tenantId', 'eventType'])
@Index('IDX_apr_metrics_occurred_at', ['occurredAt'])
export class AprMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  aprId: string;

  @Column({ type: 'varchar', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 40 })
  eventType: string;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  errorStep: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  occurredAt: Date;
}
