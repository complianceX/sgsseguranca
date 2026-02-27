import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  action: string; // 'CREATE' | 'UPDATE' | 'DELETE' | 'READ'

  @Column()
  entity: string; // 'User', 'Company', etc

  @Column()
  entityId: string;

  @Column('jsonb', { nullable: true })
  changes: Record<string, any>; // { before: {}, after: {} }

  @Column()
  ip: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column()
  companyId: string;

  @CreateDateColumn()
  timestamp: Date;
}
