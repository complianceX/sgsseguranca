import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Profile } from '../../profiles/entities/profile.entity';
import { Site } from '../../sites/entities/site.entity';
import {
  UserAccessStatus,
  UserIdentityType,
} from '../constants/user-identity.constant';
import { UserSite } from './user-site.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nome: string;

  @Column({ type: 'varchar', nullable: true })
  cpf: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  cpf_hash?: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  cpf_ciphertext?: string | null;

  @Column({ unique: true, nullable: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  funcao: string | null;

  @Column({ select: false, nullable: true })
  password?: string;

  @Column({ type: 'uuid', nullable: true, select: false })
  auth_user_id?: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: UserIdentityType.SYSTEM_USER,
  })
  identity_type: UserIdentityType;

  @Column({
    type: 'varchar',
    length: 32,
    default: UserAccessStatus.CREDENTIALED,
  })
  access_status: UserAccessStatus;

  @Column({ select: false, nullable: true })
  signature_pin_hash?: string;

  @Column({ select: false, nullable: true })
  signature_pin_salt?: string;

  @Column({ default: true })
  status: boolean;

  /** Consentimento explícito do usuário para processamento por IA (LGPD / OpenAI). */
  @Column({ default: false })
  ai_processing_consent: boolean;

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

  @OneToMany(() => UserSite, (userSite) => userSite.user)
  site_links?: UserSite[];

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
