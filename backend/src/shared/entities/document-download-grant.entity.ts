import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('document_download_grants')
@Index('IDX_document_download_grants_company_expires', [
  'company_id',
  'expires_at',
])
@Index('IDX_document_download_grants_active', ['expires_at', 'consumed_at'])
export class DocumentDownloadGrant {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  company_id: string;

  @Column({ type: 'text' })
  file_key: string;

  @Column({ type: 'text', nullable: true })
  original_name: string | null;

  @Column({ type: 'varchar', length: 120, default: 'application/pdf' })
  content_type: string;

  @Column({ type: 'uuid', nullable: true })
  issued_for_user_id: string | null;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  consumed_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
