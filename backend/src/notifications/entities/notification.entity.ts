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

@Entity('notifications')
@Index('IDX_notifications_company_created', ['company_id', 'createdAt'])
@Index('IDX_notifications_user_created', ['userId', 'createdAt'])
@Index('IDX_notifications_user_read', ['userId', 'read'])
@Index('IDX_notifications_user_type_title_created', [
  'userId',
  'type',
  'title',
  'createdAt',
])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'uuid' })
  company_id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column()
  type: string; // 'info', 'success', 'warning', 'error'

  @Column()
  title: string;

  @Column('text')
  message: string;

  @Column('jsonb', { nullable: true })
  data: Record<string, any>;

  @Column({ default: false })
  read: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  readAt: Date;
}
