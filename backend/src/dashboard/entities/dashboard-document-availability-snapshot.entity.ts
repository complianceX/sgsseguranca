import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

export enum DashboardDocumentAvailabilitySnapshotKind {
  REGISTRY_DOCUMENT = 'registry_document',
  CAT_ATTACHMENT = 'cat_attachment',
  NONCONFORMITY_ATTACHMENT = 'nonconformity_attachment',
}

export enum DashboardDocumentAvailabilityPendencyType {
  DEGRADED_DOCUMENT_AVAILABILITY = 'degraded_document_availability',
  UNAVAILABLE_GOVERNED_ATTACHMENT = 'unavailable_governed_attachment',
}

export enum DashboardDocumentAvailabilityStatus {
  READY = 'ready',
  REGISTERED_WITHOUT_SIGNED_URL = 'registered_without_signed_url',
}

@Entity('dashboard_document_availability_snapshots')
@Index(
  'UQ_dashboard_doc_availability_scope',
  ['company_id', 'snapshot_kind', 'object_key'],
  {
    unique: true,
  },
)
@Index('IDX_dashboard_doc_availability_lookup', [
  'company_id',
  'pendency_type',
  'module',
  'availability_status',
  'last_checked_at',
])
@Index('IDX_dashboard_doc_availability_document', [
  'company_id',
  'module',
  'document_id',
])
export class DashboardDocumentAvailabilitySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;

  @Column({
    type: 'varchar',
    length: 64,
  })
  pendency_type: DashboardDocumentAvailabilityPendencyType;

  @Column({
    type: 'varchar',
    length: 64,
  })
  snapshot_kind: DashboardDocumentAvailabilitySnapshotKind;

  @Column({ type: 'varchar', length: 64 })
  module: string;

  @Column({ type: 'text' })
  object_key: string;

  @Column({ type: 'uuid' })
  document_id: string;

  @Column({ type: 'uuid', nullable: true })
  site_id: string | null;

  @Column({ type: 'text' })
  file_key: string;

  @Column({ type: 'text', nullable: true })
  original_name: string | null;

  @Column({ type: 'text', nullable: true })
  document_code: string | null;

  @Column({ type: 'text', nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  status: string | null;

  @Column({ type: 'timestamp', nullable: true })
  relevant_date: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  attachment_id: string | null;

  @Column({ type: 'integer', nullable: true })
  attachment_index: number | null;

  @Column({
    type: 'varchar',
    length: 64,
    default: DashboardDocumentAvailabilityStatus.READY,
  })
  availability_status: DashboardDocumentAvailabilityStatus;

  @Column({ type: 'timestamp' })
  last_checked_at: Date;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
