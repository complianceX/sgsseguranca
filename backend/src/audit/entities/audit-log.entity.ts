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

  @Column({ type: 'uuid' })
  userId: string;

  @Column()
  action: string; // 'CREATE' | 'UPDATE' | 'DELETE' | 'READ'

  @Column()
  entity: string; // 'User', 'Company', etc

  @Column()
  entityId: string;

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

  @Column({ type: 'uuid' })
  companyId: string;

  @CreateDateColumn()
  timestamp: Date;
}
