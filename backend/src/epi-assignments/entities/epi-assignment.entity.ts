import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Epi } from '../../epis/entities/epi.entity';
import { Site } from '../../sites/entities/site.entity';
import { User } from '../../users/entities/user.entity';

export type EpiAssignmentStatus = 'entregue' | 'devolvido' | 'substituido';

export interface EpiSignatureStamp {
  signer_user_id?: string;
  signer_name?: string;
  signature_data: string;
  signature_type: string;
  signature_hash: string;
  timestamp_token: string;
  timestamp_issued_at: string;
  timestamp_authority: string;
}

@Entity('epi_assignments')
@Index(['company_id', 'status'])
@Index(['company_id', 'user_id'])
@Index(['company_id', 'created_at'])
export class EpiAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  epi_id: string;

  @ManyToOne(() => Epi)
  @JoinColumn({ name: 'epi_id' })
  epi: Epi;

  @Column()
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ nullable: true })
  site_id?: string;

  @ManyToOne(() => Site, { nullable: true })
  @JoinColumn({ name: 'site_id' })
  site?: Site;

  @Column({ nullable: true })
  ca?: string;

  @Column({ type: 'date', nullable: true })
  validade_ca?: Date;

  @Column({ type: 'int', default: 1 })
  quantidade: number;

  @Column({ type: 'varchar', default: 'entregue' })
  status: EpiAssignmentStatus;

  @Column({ type: 'timestamp' })
  entregue_em: Date;

  @Column({ type: 'timestamp', nullable: true })
  devolvido_em?: Date;

  @Column({ type: 'text', nullable: true })
  motivo_devolucao?: string;

  @Column({ type: 'text', nullable: true })
  observacoes?: string;

  @Column({ type: 'jsonb' })
  assinatura_entrega: EpiSignatureStamp;

  @Column({ type: 'jsonb', nullable: true })
  assinatura_devolucao?: EpiSignatureStamp;

  @Column({ nullable: true })
  created_by_id?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  created_by?: User;

  @Column({ nullable: true })
  updated_by_id?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'updated_by_id' })
  updated_by?: User;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
