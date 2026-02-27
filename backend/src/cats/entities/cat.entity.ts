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

export type CatStatus = 'aberta' | 'investigacao' | 'fechada';
export type CatTipo = 'tipico' | 'trajeto' | 'doenca_ocupacional' | 'outros';
export type CatGravidade = 'leve' | 'moderada' | 'grave' | 'fatal';
export type CatAttachmentCategory =
  | 'abertura'
  | 'investigacao'
  | 'fechamento'
  | 'geral';

export interface CatAttachment {
  id: string;
  file_name: string;
  file_key: string;
  file_type: string;
  category: CatAttachmentCategory;
  uploaded_by_id?: string;
  uploaded_at: Date;
}

@Entity('cats')
@Index(['company_id', 'status'])
@Index(['company_id', 'created_at'])
@Index(['company_id', 'worker_id'])
export class Cat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  numero: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ nullable: true })
  site_id?: string;

  @ManyToOne(() => Site, { nullable: true })
  @JoinColumn({ name: 'site_id' })
  site?: Site;

  @Column({ nullable: true })
  worker_id?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'worker_id' })
  worker?: User;

  @Column({ type: 'timestamp' })
  data_ocorrencia: Date;

  @Column({ type: 'varchar', default: 'tipico' })
  tipo: CatTipo;

  @Column({ type: 'varchar', default: 'moderada' })
  gravidade: CatGravidade;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'text', nullable: true })
  local_ocorrencia?: string;

  @Column({ type: 'jsonb', nullable: true })
  pessoas_envolvidas?: string[];

  @Column({ type: 'text', nullable: true })
  acao_imediata?: string;

  @Column({ type: 'text', nullable: true })
  investigacao_detalhes?: string;

  @Column({ type: 'text', nullable: true })
  causa_raiz?: string;

  @Column({ type: 'text', nullable: true })
  plano_acao_fechamento?: string;

  @Column({ type: 'text', nullable: true })
  licoes_aprendidas?: string;

  @Column({ type: 'varchar', default: 'aberta' })
  status: CatStatus;

  @Column({ nullable: true })
  opened_by_id?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'opened_by_id' })
  opened_by?: User;

  @Column({ nullable: true })
  investigated_by_id?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'investigated_by_id' })
  investigated_by?: User;

  @Column({ nullable: true })
  closed_by_id?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'closed_by_id' })
  closed_by?: User;

  @Column({ type: 'timestamp', nullable: true })
  opened_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  investigated_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  closed_at?: Date;

  @Column({ type: 'jsonb', nullable: true })
  attachments?: CatAttachment[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
