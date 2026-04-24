import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type ConsentType =
  | 'privacy'
  | 'terms'
  | 'cookies'
  | 'ai_processing'
  | 'marketing';

/**
 * Versão imutável de um texto jurídico aceito por titulares.
 *
 * Cada publicação (política nova, termos novos, consentimento de IA revisado)
 * cria uma nova linha. A versão anterior recebe `retired_at = NOW()` e a nova
 * vira a única ativa (garantia via índice parcial único).
 *
 * `body_hash` permite detectar tampering mesmo se `body_md` for reescrito
 * acidentalmente — re-calcular SHA-256 do body e comparar.
 */
@Entity('consent_versions')
@Index('IDX_consent_versions_type_effective', ['type', 'effective_at'])
export class ConsentVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  type: ConsentType;

  @Column({ type: 'varchar', length: 64 })
  version_label: string;

  @Column({ type: 'text' })
  body_md: string;

  @Column({ type: 'varchar', length: 128 })
  body_hash: string;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'timestamptz' })
  effective_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  retired_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
