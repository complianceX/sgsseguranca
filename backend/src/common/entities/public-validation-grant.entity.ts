import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('public_validation_grants')
@Index('IDX_public_validation_grants_company_code', [
  'company_id',
  'document_code',
])
@Index('IDX_public_validation_grants_active', [
  'expires_at',
  'revoked_at',
  'disabled_at',
])
export class PublicValidationGrant {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  company_id: string;

  @Column({ type: 'text' })
  document_code: string;

  @Column({ type: 'varchar', length: 80, default: 'public_validation' })
  portal: string;

  @Column({ type: 'uuid', nullable: true })
  document_id: string | null;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  revoked_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  disabled_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_validated_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
