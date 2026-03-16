import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Site } from '../../sites/entities/site.entity';
import { User } from '../../users/entities/user.entity';

@Entity('audits')
export class Audit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  titulo: string;

  @Column({ type: 'date' })
  data_auditoria: Date;

  @Column()
  tipo_auditoria: string; // interna, externa, cliente, legal, sistema de gestão

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
  @JoinColumn({ name: 'auditor_id' })
  auditor: User;

  @Column()
  auditor_id: string;

  @Column({ type: 'text', nullable: true })
  representantes_empresa: string;

  @Column({ type: 'text', nullable: true })
  objetivo: string;

  @Column({ type: 'text', nullable: true })
  escopo: string;

  @Column({ type: 'json', nullable: true })
  referencias: string[];

  @Column({ type: 'text', nullable: true })
  metodologia: string;

  @Column({ type: 'json', nullable: true })
  caracterizacao: {
    cnae?: string;
    grau_risco?: string;
    num_trabalhadores?: number;
    turnos?: string;
    atividades_principais?: string;
  };

  @Column({ type: 'json', nullable: true })
  documentos_avaliados: string[];

  @Column({ type: 'json', nullable: true })
  resultados_conformidades: string[];

  @Column({ type: 'json', nullable: true })
  resultados_nao_conformidades: {
    descricao: string;
    requisito: string;
    evidencia: string;
    classificacao: 'Leve' | 'Moderada' | 'Grave' | 'Crítica';
  }[];

  @Column({ type: 'json', nullable: true })
  resultados_observacoes: string[];

  @Column({ type: 'json', nullable: true })
  resultados_oportunidades: string[];

  @Column({ type: 'json', nullable: true })
  avaliacao_riscos: {
    perigo: string;
    classificacao: string;
    impactos: string;
    medidas_controle: string;
  }[];

  @Column({ type: 'json', nullable: true })
  plano_acao: {
    item: string;
    acao: string;
    responsavel: string;
    prazo: string;
    status: string;
  }[];

  @Column({ type: 'text', nullable: true })
  conclusao: string;

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

  @DeleteDateColumn({ nullable: true })
  deleted_at?: Date | null;
}
