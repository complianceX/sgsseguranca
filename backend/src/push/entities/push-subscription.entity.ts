import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('push_subscriptions')
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

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
