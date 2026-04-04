import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('user_sessions')
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  user_id: string;

  @Column()
  ip: string;

  @Column({ nullable: true })
  device?: string | null;

  @Column({ nullable: true })
  country?: string | null;

  @Column({ nullable: true })
  state?: string | null;

  @Column({ nullable: true })
  city?: string | null;

  @Column({ nullable: true })
  token_hash?: string | null; // Hash of the refresh token or access token to identify session

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at?: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  last_active: Date;
}
