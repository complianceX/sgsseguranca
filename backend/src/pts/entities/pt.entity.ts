import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';

export enum PtStatus {
  PENDENTE = 'Pendente',
  APROVADA = 'Aprovada',
  CANCELADA = 'Cancelada',
  ENCERRADA = 'Encerrada',
  EXPIRADA = 'Expirada',
}

export const PT_ALLOWED_TRANSITIONS: Record<PtStatus, PtStatus[]> = {
  [PtStatus.PENDENTE]: [PtStatus.APROVADA, PtStatus.CANCELADA],
  [PtStatus.APROVADA]: [PtStatus.ENCERRADA, PtStatus.CANCELADA],
  [PtStatus.CANCELADA]: [],
  [PtStatus.ENCERRADA]: [],
  [PtStatus.EXPIRADA]: [PtStatus.ENCERRADA],
};
import { Company } from '../../companies/entities/company.entity';
import { Site } from '../../sites/entities/site.entity';
import { User } from '../../users/entities/user.entity';
import { Apr } from '../../aprs/entities/apr.entity';

@Index('IDX_pts_company_created', ['company_id', 'created_at'])
@Entity('pts')
export class Pt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  numero: string;

  @Column()
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Column({ type: 'timestamp' })
  data_hora_inicio: Date;

  @Column({ type: 'timestamp' })
  data_hora_fim: Date;

  @Column({ default: 'Pendente' })
  status: string; // Pendente, Aprovada, Cancelada, Encerrada, Expirada

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

  @ManyToOne(() => Apr)
  @JoinColumn({ name: 'apr_id' })
  apr: Apr;

  @Column({ nullable: true })
  apr_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'responsavel_id' })
  responsavel: User;

  @Column()
  responsavel_id: string;

  @ManyToMany(() => User)
  @JoinTable({
    name: 'pt_executantes',
    joinColumn: { name: 'pt_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  executantes: User[];

  @Column({ default: false })
  trabalho_altura: boolean;

  @Column({ default: false })
  espaco_confinado: boolean;

  @Column({ default: false })
  trabalho_quente: boolean;

  @Column({ default: false })
  eletricidade: boolean;

  @Column({ default: false })
  escavacao: boolean;

  @Column({ type: 'int', nullable: true })
  probability?: number | null;

  @Column({ type: 'int', nullable: true })
  severity?: number | null;

  @Column({ type: 'int', nullable: true })
  exposure?: number | null;

  @Column({ type: 'int', nullable: true })
  initial_risk?: number | null;

  @Column({ type: 'varchar', nullable: true })
  residual_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;

  @Column({ type: 'text', nullable: true })
  evidence_photo?: string | null;

  @Column({ type: 'text', nullable: true })
  evidence_document?: string | null;

  @Column({ type: 'text', nullable: true })
  control_description?: string | null;

  @Column({ default: false })
  control_evidence: boolean;

  @Column({ type: 'jsonb', nullable: true })
  trabalho_altura_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  trabalho_eletrico_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  trabalho_quente_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  trabalho_espaco_confinado_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  trabalho_escavacao_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  recomendacoes_gerais_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Ciente' | 'Não';
    justificativa?: string;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  analise_risco_rapida_checklist?: Array<{
    id: string;
    pergunta: string;
    secao: 'basica' | 'adicional';
    resposta?: 'Sim' | 'Não';
  }>;

  @Column({ type: 'text', nullable: true })
  analise_risco_rapida_observacoes?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'auditado_por_id' })
  auditado_por: User;

  @Column({ nullable: true })
  auditado_por_id: string;

  @Column({ type: 'timestamp', nullable: true })
  data_auditoria: Date;

  @Column({ nullable: true })
  resultado_auditoria: string; // Conforme, Não Conforme

  @Column({ type: 'text', nullable: true })
  notas_auditoria: string;

  @Column({ type: 'text', nullable: true })
  pdf_file_key: string;

  @Column({ type: 'text', nullable: true })
  pdf_folder_path: string;

  @Column({ type: 'text', nullable: true })
  pdf_original_name: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'aprovado_por_id' })
  aprovado_por?: User;

  @Column({ type: 'uuid', nullable: true })
  aprovado_por_id?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  aprovado_em?: Date;

  @Column({ type: 'text', nullable: true })
  aprovado_motivo?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reprovado_por_id' })
  reprovado_por?: User;

  @Column({ type: 'uuid', nullable: true })
  reprovado_por_id?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reprovado_em?: Date;

  @Column({ type: 'text', nullable: true })
  reprovado_motivo?: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn({ nullable: true })
  deleted_at?: Date;
}
