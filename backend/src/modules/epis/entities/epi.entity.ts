import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseAuditEntity } from '../../../shared/entities/base-audit.entity';
import { Company } from '../../companies/entities/company.entity';

@Entity('epis')
export class Epi extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nome: string;

  @Column({ nullable: true })
  ca: string; // Certificado de Aprovação

  @Column({ type: 'date', nullable: true })
  validade_ca: Date;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Column({ default: true })
  status: boolean;

  // SGS-EPI-BR-007: NULL = estoque não rastreado (legado e EPIs sem controle de saldo).
  // Quando preenchido, entregas são bloqueadas se o saldo for insuficiente e
  // devoluções/substituições incrementam o saldo automaticamente.
  @Column({ type: 'int', nullable: true })
  quantidade_estoque?: number | null;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;
}
