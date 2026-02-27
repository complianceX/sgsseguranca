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
import { Profile } from '../../profiles/entities/profile.entity';
import { Site } from '../../sites/entities/site.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nome: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  cpf: string | null;

  @Column({ unique: true, nullable: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  funcao: string | null;

  @Column({ select: false, nullable: true })
  password?: string;

  @Column({ default: true })
  status: boolean;

  @ManyToOne(() => Company, (company) => company.users)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  company_id: string;

  @ManyToOne(() => Site)
  @JoinColumn({ name: 'site_id' })
  site: Site;

  @Column({ nullable: true })
  site_id: string;

  @ManyToOne(() => Profile, (profile) => profile.users)
  @JoinColumn({ name: 'profile_id' })
  profile: Profile;

  @Column()
  profile_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
