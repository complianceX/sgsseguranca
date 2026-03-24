import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';

@Index('IDX_medical_exams_company_created', ['company_id', 'created_at'])
@Entity('medical_exams')
export class MedicalExam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tipo_exame: string; // admissional | periodico | retorno | demissional | mudanca_funcao

  @Column()
  resultado: string; // apto | inapto | apto_com_restricoes

  @Column({ type: 'date' })
  data_realizacao: Date;

  @Column({ type: 'date', nullable: true })
  data_vencimento: Date | null;

  @Column({ type: 'varchar', nullable: true })
  medico_responsavel: string | null;

  @Column({ type: 'varchar', nullable: true })
  crm_medico: string | null;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

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

  @Column({ type: 'varchar', nullable: true })
  auditado_por_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  data_auditoria: Date | null;

  @Column({ type: 'varchar', nullable: true })
  resultado_auditoria: string | null;

  @Column({ type: 'text', nullable: true })
  notas_auditoria: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
