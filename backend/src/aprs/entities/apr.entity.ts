import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm';
import { Site } from '../../sites/entities/site.entity';
import { User } from '../../users/entities/user.entity';
import { Activity } from '../../activities/entities/activity.entity';
import { Risk } from '../../risks/entities/risk.entity';
import { Epi } from '../../epis/entities/epi.entity';
import { Tool } from '../../tools/entities/tool.entity';
import { Machine } from '../../machines/entities/machine.entity';
import { Company } from '../../companies/entities/company.entity';
import { AprLog } from './apr-log.entity';
import { AprRiskItem } from './apr-risk-item.entity';

@Entity('aprs')
export class Apr {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  numero: string;

  @Column()
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Column({ type: 'date' })
  data_inicio: Date;

  @Column({ type: 'date' })
  data_fim: Date;

  @Column({ default: 'Pendente' })
  status: string; // Pendente, Aprovada, Cancelada, Encerrada

  @Column({ default: false })
  is_modelo: boolean;

  @Column({ default: false })
  is_modelo_padrao: boolean;

  @Column({ type: 'jsonb', nullable: true })
  itens_risco?: Array<Record<string, string>>;

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
  @JoinColumn({ name: 'elaborador_id' })
  elaborador: User;

  @Column()
  elaborador_id: string;

  @ManyToMany(() => Activity)
  @JoinTable({ name: 'apr_activities' })
  activities: Activity[];

  @ManyToMany(() => Risk)
  @JoinTable({ name: 'apr_risks' })
  risks: Risk[];

  @ManyToMany(() => Epi)
  @JoinTable({ name: 'apr_epis' })
  epis: Epi[];

  @ManyToMany(() => Tool)
  @JoinTable({ name: 'apr_tools' })
  tools: Tool[];

  @ManyToMany(() => Machine)
  @JoinTable({ name: 'apr_machines' })
  machines: Machine[];

  @ManyToMany(() => User)
  @JoinTable({ name: 'apr_participants' })
  participants: User[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'auditado_por_id' })
  auditado_por: User;

  @Column({ nullable: true })
  auditado_por_id: string | null;

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

  @Column({ type: 'int', default: 1 })
  versao: number;

  @Column({ nullable: true })
  parent_apr_id: string | null;

  @ManyToOne(() => Apr, { nullable: true })
  @JoinColumn({ name: 'parent_apr_id' })
  parent_apr: Apr;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'aprovado_por_id' })
  aprovado_por: User;

  @Column({ nullable: true })
  aprovado_por_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  aprovado_em?: Date;

  @Column({ type: 'text', nullable: true })
  aprovado_motivo?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reprovado_por_id' })
  reprovado_por?: User;

  @Column({ nullable: true })
  reprovado_por_id?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reprovado_em?: Date;

  @Column({ type: 'text', nullable: true })
  reprovado_motivo?: string;

  @Column({ type: 'jsonb', nullable: true })
  classificacao_resumo?: {
    total: number;
    aceitavel: number;
    atencao: number;
    substancial: number;
    critico: number;
  };

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => AprLog, (log) => log.apr)
  logs: AprLog[];

  @OneToMany(() => AprRiskItem, (riskItem) => riskItem.apr, {
    cascade: true,
    eager: false,
  })
  risk_items: AprRiskItem[];
}
