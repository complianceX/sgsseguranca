import {
  Index,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

type AuditJsonValue = string | Record<string, unknown>;

@Index('IDX_audit_logs_company_entity_entityId', [
  'companyId',
  'entity',
  'entityId',
])
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  user_id?: string | null;

  @Column()
  action: string; // 'CREATE' | 'UPDATE' | 'DELETE' | 'READ'

  @Column()
  entity: string; // 'User', 'Company', etc

  @Column()
  entityId: string;

  @Column({ name: 'entity_id', type: 'varchar', nullable: true })
  entity_id?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  changes?: AuditJsonValue; // { before: {}, after: {} }

  @Column({ type: 'jsonb', nullable: true })
  before?: AuditJsonValue;

  @Column({ type: 'jsonb', nullable: true })
  after?: AuditJsonValue;

  @Column()
  ip: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @CreateDateColumn()
  timestamp: Date;
}
