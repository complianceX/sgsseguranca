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

export enum DidStatus {
  RASCUNHO = 'rascunho',
  ALINHADO = 'alinhado',
  EXECUTADO = 'executado',
  ARQUIVADO = 'arquivado',
}

export const DID_ALLOWED_TRANSITIONS: Record<DidStatus, DidStatus[]> = {
  [DidStatus.RASCUNHO]: [DidStatus.ALINHADO, DidStatus.ARQUIVADO],
  [DidStatus.ALINHADO]: [DidStatus.EXECUTADO, DidStatus.ARQUIVADO],
  [DidStatus.EXECUTADO]: [DidStatus.ARQUIVADO],
  [DidStatus.ARQUIVADO]: [],
};

@Index('IDX_dids_company_created', ['company_id', 'created_at'])
@Index('IDX_dids_status', ['status'])
@Entity('dids')
export class Did extends BaseAuditEntity {
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
  atividades_planejadas: string;

  @Column({ type: 'text' })
  riscos_operacionais: string;

  @Column({ type: 'text' })
  controles_planejados: string;

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
    name: 'did_participants',
    joinColumn: { name: 'did_id', referencedColumnName: 'id' },
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
    default: DidStatus.RASCUNHO,
  })
  status: DidStatus;
}
