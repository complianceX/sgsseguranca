import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';

@Index('IDX_trainings_company_created', ['company_id', 'created_at'])
@Entity('trainings')
export class Training extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nome: string; // Ex: NR-35, NR-10

  @Column({ nullable: true })
  nr_codigo?: string;

  @Column({ type: 'int', nullable: true })
  carga_horaria?: number;

  @Column({ default: true })
  obrigatorio_para_funcao: boolean;

  @Column({ default: true })
  bloqueia_operacao_quando_vencido: boolean;

  @Column()
  data_conclusao: Date;

  @Column()
  data_vencimento: Date;

  @Column({ nullable: true })
  certificado_url: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  user_id: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;

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

  @Column({ nullable: true })
  pdf_file_key?: string;

  @Column({ nullable: true })
  pdf_folder_path?: string;

  @Column({ nullable: true })
  pdf_original_name?: string;

  @Column({ nullable: true })
  pdf_file_hash?: string;

  @Column({ type: 'timestamp', nullable: true })
  pdf_generated_at?: Date;
}
