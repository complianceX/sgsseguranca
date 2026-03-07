import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Site } from '../../sites/entities/site.entity';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  razao_social: string;

  @Column({ unique: true })
  cnpj: string;

  @Column({ type: 'text' })
  endereco: string;

  @Column()
  responsavel: string;

  @Column({ type: 'text', nullable: true })
  logo_url?: string;

  @Column({ default: true })
  status: boolean;

  @Column({
    type: 'jsonb',
    nullable: true,
    default: () =>
      `'{"blockCriticalRiskWithoutEvidence":true,"blockWorkerWithoutValidMedicalExam":true,"blockWorkerWithExpiredBlockingTraining":true,"requireAtLeastOneExecutante":false}'::jsonb`,
  })
  pt_approval_rules?: {
    blockCriticalRiskWithoutEvidence: boolean;
    blockWorkerWithoutValidMedicalExam: boolean;
    blockWorkerWithExpiredBlockingTraining: boolean;
    requireAtLeastOneExecutante: boolean;
  } | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => User, (user) => user.company)
  users: User[];

  @OneToMany(() => Site, (site) => site.company)
  sites: Site[];
}
