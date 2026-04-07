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

@Entity('sites')
export class Site {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nome: string;

  @Column({ nullable: true })
  local: string;

  @Column({ nullable: true })
  endereco: string;

  @Column({ nullable: true })
  cidade: string;

  @Column({ nullable: true })
  estado: string;

  @Column({ default: true })
  status: boolean;

  @ManyToOne(() => Company, (company) => company.sites)
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
