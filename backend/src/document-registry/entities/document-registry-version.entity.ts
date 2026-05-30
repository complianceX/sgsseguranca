import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('document_registry_versions')
@Index('IDX_document_registry_versions_company_document', [
  'company_id',
  'document_id',
  'document_type',
])
@Index(
  'UQ_document_registry_versions_chain',
  ['company_id', 'document_id', 'document_type', 'version'],
  { unique: true },
)
export class DocumentRegistryVersionEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  document_id: string;

  @Column({ type: 'varchar', length: 50 })
  document_type: string;

  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  supersedes_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  finalized_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  signed_at: Date | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  hash: string | null;

  @Column({ type: 'uuid' })
  company_id: string;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  created_at: Date;
}
