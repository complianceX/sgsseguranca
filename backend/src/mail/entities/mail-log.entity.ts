import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';

const isSqlite =
  process.env.DATABASE_TYPE === 'sqlite' ||
  process.env.DATABASE_TYPE === 'better-sqlite3';

@Entity('mail_logs')
export class MailLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ nullable: true })
  company_id: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ nullable: true })
  user_id: string;

  @Column()
  to: string;

  @Column()
  subject: string;

  @Column()
  filename: string;

  @Column({ nullable: true })
  message_id: string;

  @Column({ type: isSqlite ? 'simple-json' : 'jsonb', nullable: true })
  accepted: string[];

  @Column({ type: isSqlite ? 'simple-json' : 'jsonb', nullable: true })
  rejected: string[];

  @Column({ type: 'text', nullable: true })
  provider_response: string;

  @Column({ default: false })
  using_test_account: boolean;

  @Column()
  status: string;

  @Column({ type: 'text', nullable: true })
  error_message: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn({ nullable: true })
  deleted_at: Date | null;
}
