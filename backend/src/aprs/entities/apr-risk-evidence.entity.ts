import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Apr } from './apr.entity';
import { AprRiskItem } from './apr-risk-item.entity';
import { User } from '../../users/entities/user.entity';

@Entity('apr_risk_evidences')
export class AprRiskEvidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  apr_id: string;

  @ManyToOne(() => Apr, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'apr_id' })
  apr: Apr;

  @Column()
  apr_risk_item_id: string;

  @ManyToOne(() => AprRiskItem, (riskItem) => riskItem.evidences, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'apr_risk_item_id' })
  apr_risk_item: AprRiskItem;

  @Column({ type: 'varchar', nullable: true })
  uploaded_by_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploaded_by: User | null;

  @Column({ type: 'text' })
  file_key: string;

  @Column({ type: 'text', nullable: true })
  original_name: string | null;

  @Column({ type: 'varchar', length: 100 })
  mime_type: string;

  @Column({ type: 'integer' })
  file_size_bytes: number;

  @Column({ type: 'varchar', length: 64 })
  hash_sha256: string;

  @Column({ type: 'text', nullable: true })
  watermarked_file_key: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  watermarked_hash_sha256: string | null;

  @Column({ type: 'text', nullable: true })
  watermark_text: string | null;

  @Column({ type: 'timestamp', nullable: true })
  captured_at: Date | null;

  @CreateDateColumn()
  uploaded_at: Date;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  accuracy_m: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  device_id: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip_address: string | null;

  @Column({ type: 'timestamp', nullable: true })
  exif_datetime: Date | null;

  @Column({ type: 'simple-json', nullable: true })
  integrity_flags: Record<string, unknown> | null;
}
