import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('signatures')
export class Signature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
  company_id?: string;

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
