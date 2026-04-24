import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ConsentType, ConsentVersion } from './consent-version.entity';

/**
 * Evento de aceite ou revogação de consentimento por um titular.
 *
 * Regras de interpretação:
 *  - `accepted_at IS NOT NULL AND revoked_at IS NULL` → consentimento ativo.
 *  - `revoked_at IS NOT NULL` → revogado naquela data.
 *  - Uma revogação cria uma nova linha (não sobrescreve) para preservar
 *    a trilha histórica: o aceite antigo permanece com seu IP/UA originais.
 *
 * `migrated_from_legacy=true` sinaliza que a linha veio do backfill da
 * migração 1709000000143 (sem prova material de IP/UA/timestamp originais).
 */
@Entity('user_consents')
@Index('IDX_user_consents_user_type_created', [
  'user_id',
  'type',
  'created_at',
])
@Index('IDX_user_consents_company_type', ['company_id', 'type'])
export class UserConsent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid' })
  company_id: string;

  @Column({ type: 'varchar', length: 64 })
  type: ConsentType;

  @Column({ type: 'uuid' })
  version_id: string;

  @ManyToOne(() => ConsentVersion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'version_id' })
  version?: ConsentVersion;

  @Column({ type: 'timestamptz', nullable: true })
  accepted_at: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  accepted_ip: string | null;

  @Column({ type: 'text', nullable: true })
  accepted_user_agent: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  revoked_ip: string | null;

  @Column({ type: 'text', nullable: true })
  revoked_user_agent: string | null;

  @Column({ type: 'boolean', default: false })
  migrated_from_legacy: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
