import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProfilePermissions } from '../types/profile-permissions.type';

const isSqlite =
  process.env.DATABASE_TYPE === 'sqlite' ||
  process.env.DATABASE_TYPE === 'better-sqlite3';

@Entity('profiles')
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nome: string;

  @Column({ type: isSqlite ? 'simple-json' : 'jsonb' })
  permissoes: ProfilePermissions;

  @Column({ default: true })
  status: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => User, (user) => user.profile)
  users: User[];
}
