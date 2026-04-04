import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const DOCUMENT_VIDEO_MODULES = ['inspection', 'rdo', 'dds'] as const;

export type DocumentVideoModule = (typeof DOCUMENT_VIDEO_MODULES)[number];

export type DocumentVideoProcessingStatus = 'ready';

export type DocumentVideoAvailability =
  | 'stored'
  | 'registered_without_signed_url'
  | 'removed';

@Entity('document_video_attachments')
@Index('IDX_document_video_company_module_document_created', [
  'company_id',
  'module',
  'document_id',
  'created_at',
])
@Index('IDX_document_video_company_module_document_removed', [
  'company_id',
  'module',
  'document_id',
  'removed_at',
])
@Index('IDX_document_video_storage_key', ['storage_key'])
export class DocumentVideoAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  company_id: string;

  @Column({ type: 'varchar', length: 50 })
  module: DocumentVideoModule;

  @Column({ type: 'varchar', length: 50 })
  document_type: DocumentVideoModule;

  @Column({ type: 'varchar', length: 120 })
  document_id: string;

  @Column({ type: 'text' })
  original_name: string;

  @Column({ type: 'varchar', length: 120 })
  mime_type: string;

  @Column({ type: 'integer' })
  size_bytes: number;

  @Column({ type: 'varchar', length: 64 })
  file_hash: string;

  @Column({ type: 'text' })
  storage_key: string;

  @Column({ type: 'uuid', nullable: true })
  uploaded_by_id?: string | null;

  @Column({ type: 'timestamp' })
  uploaded_at: Date;

  @Column({ type: 'integer', nullable: true })
  duration_seconds?: number | null;

  @Column({ type: 'varchar', length: 32, default: 'ready' })
  processing_status: DocumentVideoProcessingStatus;

  @Column({ type: 'varchar', length: 64, default: 'stored' })
  availability: DocumentVideoAvailability;

  @Column({ type: 'timestamp', nullable: true })
  removed_at?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  removed_by_id?: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
