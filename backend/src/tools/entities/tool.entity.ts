import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { Company } from '../../companies/entities/company.entity';

@Entity('tools')
export class Tool extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nome: string;

  @Column({ nullable: true })
  numero_serie: string;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Column({ default: true })
  status: boolean;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;

}
