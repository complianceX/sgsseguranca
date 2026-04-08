import {
  Index,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';

@Entity('signatures')
@Index('IDX_signatures_document_type_document_id', [
  'document_type',
  'document_id',
])
export class Signature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'uuid' })
  company_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  user_id: string;

  @Column()
  document_id: string;

  @Column()
  document_type: string; // 'DDS', 'APR', etc.

  @Column({ type: 'text' })
  signature_data: string; // base64 string

  @Column()
  type: string; // 'digital', 'upload', 'facial'

  @Column({ nullable: true })
  signature_hash?: string;

  @Column({ nullable: true })
  timestamp_token?: string;

  @Column({ nullable: true })
  timestamp_authority?: string;

  @Column({ type: 'timestamp', nullable: true })
  signed_at?: Date;

  @Column({ type: 'jsonb', nullable: true })
  integrity_payload?: Record<string, unknown>;

  @CreateDateColumn()
  created_at: Date;
}
