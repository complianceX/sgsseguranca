import {
  Index,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('notifications')
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

  @Column()
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
