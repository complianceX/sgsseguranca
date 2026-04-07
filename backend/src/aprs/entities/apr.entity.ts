import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm';

export enum AprStatus {
  PENDENTE = 'Pendente',
  APROVADA = 'Aprovada',
  CANCELADA = 'Cancelada',
  ENCERRADA = 'Encerrada',
}

export const APR_ALLOWED_TRANSITIONS: Record<AprStatus, AprStatus[]> = {
  [AprStatus.PENDENTE]: [AprStatus.APROVADA, AprStatus.CANCELADA],
  [AprStatus.APROVADA]: [AprStatus.ENCERRADA, AprStatus.CANCELADA],
  [AprStatus.CANCELADA]: [],
  [AprStatus.ENCERRADA]: [],
};
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

  @Column({ type: 'varchar', default: AprStatus.PENDENTE })
  status: AprStatus;

  /**
   * Semântica atual (legado em transição):
   * - `false`: APR operacional comum
   * - `true`: APR marcada como modelo reutilizável
   *
   * Observação: o backend ainda convive com `is_modelo_padrao`.
   * Quando `is_modelo_padrao = true`, o serviço força `is_modelo = true`.
   * Ver migration de planejamento `template_type` para unificação semântica.
   */
  @Column({ default: false })
  is_modelo: boolean;

  /**
   * Semântica atual (legado em transição):
   * - `true`: modelo padrão da empresa (único por `company_id`)
   * - `false`: APR sem status de modelo padrão
   *
   * Regra de consistência aplicada no serviço:
   * - `is_modelo_padrao = true` => `is_modelo = true`
   * - `is_modelo = false` => `is_modelo_padrao = false`
   */
  @Column({ default: false })
  is_modelo_padrao: boolean;

  @Column({ type: 'simple-json', nullable: true })
  itens_risco?: Array<Record<string, string>>;

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
  @JoinTable({
    name: 'apr_activities',
    joinColumn: { name: 'apr_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'activity_id', referencedColumnName: 'id' },
  })
  activities: Activity[];

  @ManyToMany(() => Risk)
  @JoinTable({
    name: 'apr_risks',
    joinColumn: { name: 'apr_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'risk_id', referencedColumnName: 'id' },
  })
  risks: Risk[];

  @ManyToMany(() => Epi)
  @JoinTable({
    name: 'apr_epis',
    joinColumn: { name: 'apr_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'epi_id', referencedColumnName: 'id' },
  })
  epis: Epi[];

  @ManyToMany(() => Tool)
  @JoinTable({
    name: 'apr_tools',
    joinColumn: { name: 'apr_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tool_id', referencedColumnName: 'id' },
  })
  tools: Tool[];

  @ManyToMany(() => Machine)
  @JoinTable({
    name: 'apr_machines',
    joinColumn: { name: 'apr_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'machine_id', referencedColumnName: 'id' },
  })
  machines: Machine[];

  @ManyToMany(() => User)
  @JoinTable({
    name: 'apr_participants',
    joinColumn: { name: 'apr_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  participants: User[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'auditado_por_id' })
  auditado_por: User;

  @Column({ type: 'varchar', nullable: true })
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

  @Column({ type: 'varchar', nullable: true })
  parent_apr_id: string | null;

  @ManyToOne(() => Apr, { nullable: true })
  @JoinColumn({ name: 'parent_apr_id' })
  parent_apr: Apr;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'aprovado_por_id' })
  aprovado_por: User;

  @Column({ type: 'varchar', nullable: true })
  aprovado_por_id: string | null;

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

  @Column({ type: 'simple-json', nullable: true })
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

  @DeleteDateColumn({ nullable: true })
  deleted_at?: Date;

  @OneToMany(() => AprLog, (log) => log.apr)
  logs: AprLog[];

  @OneToMany(() => AprRiskItem, (riskItem) => riskItem.apr, {
    cascade: true,
    eager: false,
  })
  risk_items: AprRiskItem[];
}
