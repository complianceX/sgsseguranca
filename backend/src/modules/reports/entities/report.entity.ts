import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

type MonthlyReportStatsSnapshot = {
  aprs_count: number;
  pts_count: number;
  dds_count: number;
  checklists_count: number;
  trainings_count: number;
  epis_expired_count: number;
};

@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Column()
  mes: number;

  @Column()
  ano: number;

  @Column({ type: 'jsonb' })
  estatisticas: MonthlyReportStatsSnapshot;

  @Column({ type: 'text', nullable: true })
  analise_gandra: string;

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

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
