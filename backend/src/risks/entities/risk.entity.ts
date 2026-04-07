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

@Entity('risks')
export class Risk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nome: string;

  @Column()
  categoria: string; // Físico, Químico, Biológico, Ergonômico, Acidente

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Column({ type: 'text', nullable: true })
  medidas_controle: string;

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

  @Column({ type: 'varchar', nullable: true })
  control_hierarchy?:
    | 'ELIMINATION'
    | 'SUBSTITUTION'
    | 'ENGINEERING'
    | 'ADMINISTRATIVE'
    | 'PPE'
    | null;

  @Column({ type: 'text', nullable: true })
  evidence_photo?: string | null;

  @Column({ type: 'text', nullable: true })
  evidence_document?: string | null;

  @Column({ type: 'text', nullable: true })
  control_description?: string | null;

  @Column({ default: false })
  control_evidence: boolean;

  @Column({ default: true })
  status: boolean;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn({ nullable: true })
  deleted_at?: Date;
}
