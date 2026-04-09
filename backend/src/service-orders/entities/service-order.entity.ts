import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';
import { Site } from '../../sites/entities/site.entity';

export interface RiscoIdentificado {
  risco: string;
  medida_controle: string;
}

export interface EpiNecessario {
  nome: string;
  ca: string;
}

@Entity('service_orders')
@Index('UQ_service_orders_company_numero', ['company_id', 'numero'], {
  unique: true,
})
export class ServiceOrder extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  numero: string; // OS-YYYYMM-NNN

  @Column()
  titulo: string;

  @Column({ type: 'text' })
  descricao_atividades: string;

  @Column({ type: 'jsonb', nullable: true })
  riscos_identificados: RiscoIdentificado[] | null;

  @Column({ type: 'jsonb', nullable: true })
  epis_necessarios: EpiNecessario[] | null;

  @Column({ type: 'text', nullable: true })
  responsabilidades: string | null;

  @Column({ default: 'ativo' })
  status: string; // ativo | concluido | cancelado

  @Column({ type: 'date' })
  data_emissao: Date;

  @Column({ type: 'date', nullable: true })
  data_inicio: Date | null;

  @Column({ type: 'date', nullable: true })
  data_fim_previsto: Date | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'responsavel_id' })
  responsavel: User;

  @Column({ type: 'varchar', nullable: true })
  responsavel_id: string | null;

  @ManyToOne(() => Site, { nullable: true })
  @JoinColumn({ name: 'site_id' })
  site: Site;

  @Column({ type: 'varchar', nullable: true })
  site_id: string | null;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;

  @Column({ type: 'text', nullable: true })
  assinatura_responsavel: string | null;

  @Column({ type: 'text', nullable: true })
  assinatura_colaborador: string | null;

  @Column({ type: 'varchar', nullable: true })
  pdf_file_key: string | null;

  @Column({ type: 'varchar', nullable: true })
  pdf_folder_path: string | null;

  @Column({ type: 'varchar', nullable: true })
  pdf_original_name: string | null;

}
