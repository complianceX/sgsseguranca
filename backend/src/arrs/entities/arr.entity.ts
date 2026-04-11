import {
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { Company } from '../../companies/entities/company.entity';
import { Site } from '../../sites/entities/site.entity';
import { User } from '../../users/entities/user.entity';

export enum ArrStatus {
  RASCUNHO = 'rascunho',
  ANALISADA = 'analisada',
  TRATADA = 'tratada',
  ARQUIVADA = 'arquivada',
}

export const ARR_ALLOWED_TRANSITIONS: Record<ArrStatus, ArrStatus[]> = {
  [ArrStatus.RASCUNHO]: [ArrStatus.ANALISADA, ArrStatus.ARQUIVADA],
  [ArrStatus.ANALISADA]: [ArrStatus.TRATADA, ArrStatus.ARQUIVADA],
  [ArrStatus.TRATADA]: [ArrStatus.ARQUIVADA],
  [ArrStatus.ARQUIVADA]: [],
};

@Index('IDX_arrs_company_created', ['company_id', 'created_at'])
@Index('IDX_arrs_status', ['status'])
@Entity('arrs')
export class Arr extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  @Column({ type: 'date' })
  data: Date;

  @Column({ type: 'varchar', length: 30, nullable: true })
  turno: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  frente_trabalho: string | null;

  @Column({ type: 'varchar', length: 255 })
  atividade_principal: string;

  @Column({ type: 'text' })
  condicao_observada: string;

  @Column({ type: 'text' })
  risco_identificado: string;

  @Column({ type: 'varchar', length: 20 })
  nivel_risco: string;

  @Column({ type: 'varchar', length: 20 })
  probabilidade: string;

  @Column({ type: 'varchar', length: 20 })
  severidade: string;

  @Column({ type: 'text' })
  controles_imediatos: string;

  @Column({ type: 'text', nullable: true })
  acao_recomendada: string | null;

  @Column({ type: 'text', nullable: true })
  epi_epc_aplicaveis: string | null;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;

  @ManyToOne(() => Site)
  @JoinColumn({ name: 'site_id' })
  site: Site;

  @Column()
  site_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'responsavel_id' })
  responsavel: User;

  @Column()
  responsavel_id: string;

  @ManyToMany(() => User)
  @JoinTable({
    name: 'arr_participants',
    joinColumn: { name: 'arr_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  participants: User[];

  @Column({ type: 'text', nullable: true })
  pdf_file_key: string | null;

  @Column({ type: 'text', nullable: true })
  pdf_folder_path: string | null;

  @Column({ type: 'text', nullable: true })
  pdf_original_name: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: ArrStatus.RASCUNHO,
  })
  status: ArrStatus;
}
