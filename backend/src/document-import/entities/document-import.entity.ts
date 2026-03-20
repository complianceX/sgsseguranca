import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { DocumentImportStatus } from './document-import-status.enum';

export interface DocumentImportMetadata {
  scoreClassificacao?: number;
  quantidadeTexto?: number;
  validacao?: any;
  erro?: string;
  timestampFalha?: string;
  timestampFinalizacao?: string;
  [key: string]: any;
}

@Entity('document_imports')
@Index('UQ_document_imports_empresa_hash', ['empresaId', 'hash'], {
  unique: true,
})
export class DocumentImport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId!: string;

  @Column({ name: 'tipo_documento', length: 50, nullable: true })
  tipoDocumento!: string;

  @Column({ name: 'nome_arquivo', length: 255, nullable: true })
  nomeArquivo!: string;

  @Column({ name: 'hash', length: 64 })
  hash!: string;

  @Column({ name: 'tamanho', type: 'integer', nullable: true })
  tamanho!: number;

  @Column({ name: 'texto_extraido', type: 'text', nullable: true })
  textoExtraido!: string;

  @Column({ name: 'json_estruturado', type: 'jsonb', nullable: true })
  jsonEstruturado!: Record<string, unknown>;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata!: DocumentImportMetadata;

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
  dataDocumento!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'mensagem_erro', type: 'text', nullable: true })
  mensagemErro!: string;

  constructor(partial?: Partial<DocumentImport>) {
    Object.assign(this, partial);
  }
}
