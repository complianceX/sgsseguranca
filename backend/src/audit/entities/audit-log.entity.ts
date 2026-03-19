import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

type AuditJsonValue = string | Record<string, unknown>;

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  user_id?: string;

  @Column()
  action: string; // 'CREATE' | 'UPDATE' | 'DELETE' | 'READ'

  @Column()
  entity: string; // 'User', 'Company', etc

  @Column({ nullable: true })
  entity_type?: string;

  @Column()
  entityId: string;

  @Column({ nullable: true })
  entity_id?: string;

  @Column('simple-json', { nullable: true })
  changes?: AuditJsonValue; // { before: {}, after: {} }

  @Column('simple-json', { nullable: true })
  before?: AuditJsonValue;

  @Column('simple-json', { nullable: true })
  after?: AuditJsonValue;

  @Column()
  ip: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column()
  companyId: string;

  @CreateDateColumn()
  timestamp: Date;

  @CreateDateColumn({ nullable: true })
  created_at?: Date;
}
