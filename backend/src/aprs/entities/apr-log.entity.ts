import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Apr } from './apr.entity';

@Entity('apr_logs')
export class AprLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  apr_id: string;

  @ManyToOne(() => Apr, (apr) => apr.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'apr_id' })
  apr: Apr;

  @Column({ nullable: true })
  usuario_id: string;

  @Column({ length: 100 })
  acao: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'data_hora' })
  data_hora: Date;
}
