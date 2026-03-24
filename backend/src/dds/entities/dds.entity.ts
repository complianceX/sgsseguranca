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
import { Company } from '../../companies/entities/company.entity';
import { Site } from '../../sites/entities/site.entity';
import { User } from '../../users/entities/user.entity';

export enum DdsStatus {
  RASCUNHO = 'rascunho',
  PUBLICADO = 'publicado',
  AUDITADO = 'auditado',
  ARQUIVADO = 'arquivado',
}

export const DDS_ALLOWED_TRANSITIONS: Record<DdsStatus, DdsStatus[]> = {
  [DdsStatus.RASCUNHO]: [DdsStatus.PUBLICADO, DdsStatus.ARQUIVADO],
  [DdsStatus.PUBLICADO]: [DdsStatus.AUDITADO, DdsStatus.ARQUIVADO],
  [DdsStatus.AUDITADO]: [DdsStatus.ARQUIVADO],
  [DdsStatus.ARQUIVADO]: [],
};

@Index('IDX_dds_company_created', ['company_id', 'created_at'])
@Entity('dds')
export class Dds {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tema: string;

  @Column({ type: 'text', nullable: true })
  conteudo: string;

  @Column({ type: 'date' })
  data: Date;

  @Column({ default: false })
  is_modelo: boolean;

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
  @JoinColumn({ name: 'facilitador_id' })
  facilitador: User;

  @Column()
  facilitador_id: string;

  @ManyToMany(() => User)
  @JoinTable({
    name: 'dds_participants',
    joinColumn: { name: 'dds_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  participants: User[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'auditado_por_id' })
  auditado_por: User;

  @Column({ nullable: true })
  auditado_por_id: string;

  @Column({ type: 'timestamp', nullable: true })
  data_auditoria: Date;

  @Column({ nullable: true })
  resultado_auditoria: string; // Conforme, Não Conforme, Observação

  @Column({ type: 'text', nullable: true })
  notas_auditoria: string;

  @Column({ type: 'text', nullable: true })
  pdf_file_key: string;

  @Column({ type: 'text', nullable: true })
  pdf_folder_path: string;

  @Column({ type: 'text', nullable: true })
  pdf_original_name: string;

  @Column({
    type: 'varchar',
    default: DdsStatus.RASCUNHO,
    enum: DdsStatus,
  })
  status: DdsStatus;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn({ nullable: true })
  deleted_at: Date;
}
