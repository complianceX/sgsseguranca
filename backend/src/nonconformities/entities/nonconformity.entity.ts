import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Site } from '../../sites/entities/site.entity';

@Entity('nonconformities')
export class NonConformity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;

  @ManyToOne(() => Site, { nullable: true })
  @JoinColumn({ name: 'site_id' })
  site?: Site;

  @Column({ nullable: true })
  site_id?: string;

  @Column()
  codigo_nc: string;

  @Column()
  tipo: string;

  @Column({ type: 'date' })
  data_identificacao: Date;

  @Column()
  local_setor_area: string;

  @Column()
  atividade_envolvida: string;

  @Column()
  responsavel_area: string;

  @Column()
  auditor_responsavel: string;

  @Column({ type: 'json', nullable: true })
  classificacao?: string[];

  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'text' })
  evidencia_observada: string;

  @Column({ type: 'text' })
  condicao_insegura: string;

  @Column({ type: 'text', nullable: true })
  ato_inseguro?: string;

  @Column()
  requisito_nr: string;

  @Column()
  requisito_item: string;

  @Column({ nullable: true })
  requisito_procedimento?: string;

  @Column({ nullable: true })
  requisito_politica?: string;

  @Column()
  risco_perigo: string;

  @Column()
  risco_associado: string;

  @Column({ type: 'json', nullable: true })
  risco_consequencias?: string[];

  @Column()
  risco_nivel: string;

  @Column({ type: 'json', nullable: true })
  causa?: string[];

  @Column({ nullable: true })
  causa_outro?: string;

  @Column({ type: 'text', nullable: true })
  acao_imediata_descricao?: string;

  @Column({ type: 'date', nullable: true })
  acao_imediata_data?: Date;

  @Column({ nullable: true })
  acao_imediata_responsavel?: string;

  @Column({ nullable: true })
  acao_imediata_status?: string;

  @Column({ type: 'text', nullable: true })
  acao_definitiva_descricao?: string;

  @Column({ type: 'date', nullable: true })
  acao_definitiva_prazo?: Date;

  @Column({ nullable: true })
  acao_definitiva_responsavel?: string;

  @Column({ type: 'text', nullable: true })
  acao_definitiva_recursos?: string;

  @Column({ type: 'date', nullable: true })
  acao_definitiva_data_prevista?: Date;

  @Column({ type: 'text', nullable: true })
  acao_preventiva_medidas?: string;

  @Column({ type: 'text', nullable: true })
  acao_preventiva_treinamento?: string;

  @Column({ type: 'text', nullable: true })
  acao_preventiva_revisao_procedimento?: string;

  @Column({ type: 'text', nullable: true })
  acao_preventiva_melhoria_processo?: string;

  @Column({ type: 'text', nullable: true })
  acao_preventiva_epc_epi?: string;

  @Column({ nullable: true })
  verificacao_resultado?: string;

  @Column({ type: 'text', nullable: true })
  verificacao_evidencias?: string;

  @Column({ type: 'date', nullable: true })
  verificacao_data?: Date;

  @Column({ nullable: true })
  verificacao_responsavel?: string;

  @Column()
  status: string;

  @Column({ type: 'text', nullable: true })
  observacoes_gerais?: string;

  @Column({ type: 'json', nullable: true })
  anexos?: string[];

  @Column({ nullable: true })
  assinatura_responsavel_area?: string;

  @Column({ nullable: true })
  assinatura_tecnico_auditor?: string;

  @Column({ nullable: true })
  assinatura_gestao?: string;

  @Column({ type: 'text', nullable: true })
  pdf_file_key: string;

  @Column({ type: 'text', nullable: true })
  pdf_folder_path: string;

  @Column({ type: 'text', nullable: true })
  pdf_original_name: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
