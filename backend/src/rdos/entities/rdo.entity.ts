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
import { Site } from '../../sites/entities/site.entity';
import { User } from '../../users/entities/user.entity';

export interface MaoDeObraItem {
  funcao: string;
  quantidade: number;
  turno: 'manha' | 'tarde' | 'noite';
  horas: number;
}

export interface EquipamentoItem {
  nome: string;
  quantidade: number;
  horas_trabalhadas: number;
  horas_ociosas: number;
  observacao?: string;
}

export interface MaterialItem {
  descricao: string;
  unidade: string;
  quantidade: number;
  fornecedor?: string;
}

export interface ServicoItem {
  descricao: string;
  percentual_concluido: number;
  observacao?: string;
}

export interface OcorrenciaItem {
  tipo: 'acidente' | 'incidente' | 'visita' | 'paralisacao' | 'outro';
  descricao: string;
  hora?: string;
}

@Entity('rdos')
@Index('UQ_rdos_company_numero', ['company_id', 'numero'], { unique: true })
export class Rdo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  numero: string;

  @Column({ type: 'date' })
  data: Date;

  @Column({ default: 'rascunho' })
  status: string; // rascunho | enviado | aprovado | cancelado

  // Multi-tenant
  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;

  // Obra/Setor
  @ManyToOne(() => Site, { nullable: true })
  @JoinColumn({ name: 'site_id' })
  site?: Site;

  @Column({ nullable: true })
  site_id?: string;

  // Responsável
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'responsavel_id' })
  responsavel?: User;

  @Column({ nullable: true })
  responsavel_id?: string;

  // Condições climáticas
  @Column({ nullable: true })
  clima_manha?: string;

  @Column({ nullable: true })
  clima_tarde?: string;

  @Column({ type: 'decimal', precision: 5, scale: 1, nullable: true })
  temperatura_min?: number;

  @Column({ type: 'decimal', precision: 5, scale: 1, nullable: true })
  temperatura_max?: number;

  @Column({ nullable: true })
  condicao_terreno?: string;

  // Seções dinâmicas (JSONB)
  @Column({ type: 'json', nullable: true })
  mao_de_obra?: MaoDeObraItem[];

  @Column({ type: 'json', nullable: true })
  equipamentos?: EquipamentoItem[];

  @Column({ type: 'json', nullable: true })
  materiais_recebidos?: MaterialItem[];

  @Column({ type: 'json', nullable: true })
  servicos_executados?: ServicoItem[];

  @Column({ type: 'json', nullable: true })
  ocorrencias?: OcorrenciaItem[];

  // Flags rápidas
  @Column({ default: false })
  houve_acidente: boolean;

  @Column({ default: false })
  houve_paralisacao: boolean;

  @Column({ type: 'text', nullable: true })
  motivo_paralisacao?: string;

  // Texto livre
  @Column({ type: 'text', nullable: true })
  observacoes?: string;

  @Column({ type: 'text', nullable: true })
  programa_servicos_amanha?: string;

  // Assinaturas digitais (JSON serializado)
  @Column({ type: 'text', nullable: true })
  assinatura_responsavel?: string;

  @Column({ type: 'text', nullable: true })
  assinatura_engenheiro?: string;

  // PDF gerado
  @Column({ nullable: true })
  pdf_file_key?: string;

  @Column({ nullable: true })
  pdf_folder_path?: string;

  @Column({ nullable: true })
  pdf_original_name?: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
