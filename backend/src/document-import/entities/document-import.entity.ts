import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { DocumentImportStatus } from './document-import-status.enum';
import type { DocumentAnalysisResponseDto } from '../dto/document-analysis.dto';

export interface DocumentImportMetadata {
  scoreClassificacao?: number;
  quantidadeTexto?: number;
  autoCreatedDdsId?: string | null;
  autoCreateDds?: {
    state?: 'pending' | 'created' | 'failed';
    requestedAt?: string;
    completedAt?: string;
    ddsId?: string | null;
    error?: string;
  };
  queue?: {
    statusUrl?: string;
    enqueuedAt?: string;
    timeoutMs?: number;
    attempts?: number;
    lastQueueState?: string;
  };
  validacao?: {
    status?: 'VALIDO' | 'INCOMPLETO' | 'CRITICO';
    pendencias?: string[];
    scoreConfianca?: number;
  };
  erro?: string;
  timestampFalha?: string;
  timestampFinalizacao?: string;
}

@Entity('document_imports')
@Index('UQ_document_imports_empresa_hash', ['empresaId', 'hash'], {
  unique: true,
})
@Index(
  'UQ_document_imports_empresa_idempotency_key',
  ['empresaId', 'idempotencyKey'],
  {
    unique: true,
    where: '"idempotency_key" IS NOT NULL',
  },
)
export class DocumentImport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId!: string;

  @Column({
    name: 'tipo_documento',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  tipoDocumento!: string | null;

  @Column({
    name: 'nome_arquivo',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  nomeArquivo!: string | null;

  @Column({ name: 'hash', length: 64 })
  hash!: string;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  idempotencyKey!: string | null;

  @Column({ name: 'tamanho', type: 'integer', nullable: true })
  tamanho!: number | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 120, nullable: true })
  mimeType!: string | null;

  @Column({ name: 'texto_extraido', type: 'text', nullable: true })
  textoExtraido!: string | null;

  @Column({
    name: 'arquivo_staging',
    type: 'bytea',
    nullable: true,
    select: false,
  })
  arquivoStaging!: Buffer | null;

  @Column({ name: 'json_estruturado', type: 'jsonb', nullable: true })
  jsonEstruturado!: DocumentAnalysisResponseDto | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata!: DocumentImportMetadata | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: DocumentImportStatus,
    default: DocumentImportStatus.UPLOADED,
  })
  status!: DocumentImportStatus;

  @Column({
    name: 'score_confianca',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  scoreConfianca!: number;

  @Column({ name: 'data_documento', type: 'date', nullable: true })
  dataDocumento!: Date | null;

  @Column({
    name: 'processing_job_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  processingJobId!: string | null;

  @Column({ name: 'processing_attempts', type: 'integer', default: 0 })
  processingAttempts!: number;

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt!: Date | null;

  @Column({ name: 'dead_lettered_at', type: 'timestamptz', nullable: true })
  deadLetteredAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'mensagem_erro', type: 'text', nullable: true })
  mensagemErro!: string | null;

  constructor(partial?: Partial<DocumentImport>) {
    Object.assign(this, partial);
  }
}
