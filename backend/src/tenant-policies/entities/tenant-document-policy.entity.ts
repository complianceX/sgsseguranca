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
import { DEFAULT_RETENTION_DAYS } from '../../common/storage/document-retention.constants';

@Entity('tenant_document_policies')
@Index('UQ_tenant_document_policies_company', ['company_id'], { unique: true })
export class TenantDocumentPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'uuid' })
  company_id: string;

  @Column({ type: 'integer', default: DEFAULT_RETENTION_DAYS.apr })
  retention_days_apr: number;

  @Column({ type: 'integer', default: DEFAULT_RETENTION_DAYS.dds })
  retention_days_dds: number;

  @Column({ type: 'integer', default: DEFAULT_RETENTION_DAYS.pt })
  retention_days_pts: number;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}
