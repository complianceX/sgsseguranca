import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';

@Entity('pdf_integrity_records')
export class PdfIntegrityRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  hash: string;

  @Column({ type: 'text', nullable: true })
  original_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  signed_by_user_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'signed_by_user_id' })
  signed_by_user?: User | null;

  @Column({ type: 'varchar', nullable: true })
  company_id: string | null;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company?: Company | null;

  @CreateDateColumn()
  created_at: Date;
}
