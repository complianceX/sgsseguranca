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

export enum DocumentRegistryStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
}

@Entity('document_registry')
@Index('IDX_document_registry_company_week', [
  'company_id',
  'iso_year',
  'iso_week',
])
@Index('IDX_document_registry_module_entity', ['module', 'entity_id'])
@Index('IDX_document_registry_company_status_expiry', [
  'company_id',
  'status',
  'expires_at',
])
export class DocumentRegistryEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;

  @Column({ length: 50 })
  module: string;

  @Column({ length: 50, default: 'pdf' })
  document_type: string;

  @Column()
  entity_id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'timestamp', nullable: true })
  document_date: Date | null;

  @Column({ type: 'integer' })
  iso_year: number;

  @Column({ type: 'integer' })
  iso_week: number;

  @Column({ type: 'text' })
  file_key: string;

  @Column({ type: 'text', nullable: true })
  folder_path: string | null;

  @Column({ type: 'text', nullable: true })
  original_name: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  mime_type: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  file_hash: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  document_code: string | null;

  @Column({
    type: 'enum',
    enum: DocumentRegistryStatus,
    default: DocumentRegistryStatus.ACTIVE,
  })
  status: DocumentRegistryStatus;

  @Column({ type: 'boolean', default: false })
  litigation_hold: boolean;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
