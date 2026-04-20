import {
  Index,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Index('UQ_push_subscriptions_endpoint', ['endpoint'], { unique: true })
@Index('IDX_push_subscriptions_tenant_user_endpoint', [
  'tenantId',
  'userId',
  'endpoint',
])
@Entity('push_subscriptions')
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column()
  endpoint: string;

  @Column('simple-json')
  keys: {
    p256dh: string;
    auth: string;
  };

  @CreateDateColumn()
  createdAt: Date;
}
