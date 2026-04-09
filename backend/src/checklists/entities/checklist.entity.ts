import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { Company } from '../../companies/entities/company.entity';
import { Site } from '../../sites/entities/site.entity';
import { User } from '../../users/entities/user.entity';
import { ChecklistItemValue } from '../types/checklist-item.type';

@Entity('checklists')
export class Checklist extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Column({ nullable: true })
  equipamento: string;

  @Column({ nullable: true })
  maquina: string;

  @Column({ type: 'text', nullable: true })
  foto_equipamento: string;

  @Column({ type: 'date' })
  data: Date;

  @Column({ default: 'Pendente' })
  status: string; // Conforme, Não Conforme, Pendente

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;

  @ManyToOne(() => Site, { nullable: true })
  @JoinColumn({ name: 'site_id' })
  site: Site;

  @Column({ nullable: true })
  site_id: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'inspetor_id' })
  inspetor: User;

  @Column({ nullable: true })
  inspetor_id: string;

  @Column({ type: 'jsonb', nullable: true })
  itens: ChecklistItemValue[]; // Lista de itens verificados

  @Column({ default: false })
  is_modelo: boolean;

  @ManyToOne(() => Checklist, { nullable: true })
  @JoinColumn({ name: 'template_id' })
  template: Checklist;

  @Column({ nullable: true })
  template_id: string;

  @Column({ default: true })
  ativo: boolean;

  @Column({ nullable: true })
  categoria: string; // SST, Qualidade, Equipamento, Interno

  @Column({ nullable: true })
  periodicidade: string; // Diário, Semanal, Mensal, Eventual

  @Column({ nullable: true })
  nivel_risco_padrao: string; // Baixo, Médio, Alto

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

}
