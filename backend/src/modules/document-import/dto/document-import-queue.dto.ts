import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentImportStatus } from '../entities/document-import-status.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DocumentAnalysisResponseDto,
  DocumentImportMetadataDto,
  DocumentValidationResultDto,
} from './document-analysis.dto';

export class DocumentImportJobSnapshotDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Identificador do job na fila.',
    nullable: true,
  })
  @IsString()
  @IsOptional()
  jobId?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: 'Estado atual do job na fila.',
    nullable: true,
  })
  @IsString()
  @IsOptional()
  queueState?: string | null;

  @ApiPropertyOptional({
    description: 'Quantidade de tentativas já consumidas pelo worker.',
  })
  @IsNumber()
  @IsOptional()
  attemptsMade?: number;

  @ApiPropertyOptional({
    description: 'Quantidade máxima de tentativas configuradas.',
  })
  @IsNumber()
  @IsOptional()
  maxAttempts?: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Timestamp da última tentativa conhecida.',
    nullable: true,
  })
  @IsDateString()
  @IsOptional()
  lastAttemptAt?: string | null;

  @ApiProperty({
    description:
      'Indica se o job já foi para a DLQ/estado terminal equivalente.',
  })
  @IsBoolean()
  deadLettered!: boolean;
}

export class DocumentImportEnqueueResponseDto {
  @ApiProperty()
  @IsBoolean()
  success!: boolean;

  @ApiProperty()
  @IsBoolean()
  queued!: boolean;

  @ApiProperty({ format: 'uuid' })
  @IsString()
  documentId!: string;

  @ApiProperty({ enum: DocumentImportStatus })
  @IsEnum(DocumentImportStatus)
  status!: DocumentImportStatus;

  @ApiProperty({ type: () => DocumentImportJobSnapshotDto })
  @ValidateNested()
  @Type(() => DocumentImportJobSnapshotDto)
  job!: DocumentImportJobSnapshotDto;

  @ApiProperty({
    example: '/documents/import/11111111-1111-4111-8111-111111111111/status',
  })
  @IsString()
  statusUrl!: string;

  @ApiProperty()
  @IsBoolean()
  reused!: boolean;

  @ApiProperty({
    enum: ['new', 'in_progress', 'completed', 'failed'],
  })
  @IsIn(['new', 'in_progress', 'completed', 'failed'])
  replayState!: 'new' | 'in_progress' | 'completed' | 'failed';

  @ApiPropertyOptional({
    enum: ['idempotency_key', 'file_hash'],
  })
  @IsString()
  @IsOptional()
  dedupeSource?: 'idempotency_key' | 'file_hash';

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Chave formal de idempotência reconhecida pela operação.',
  })
  @IsString()
  @IsOptional()
  idempotencyKey?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  message?: string;
}

export class DocumentImportStatusResponseDto {
  @ApiProperty()
  @IsBoolean()
  success!: boolean;

  @ApiProperty({ format: 'uuid' })
  @IsString()
  documentId!: string;

  @ApiProperty({ enum: DocumentImportStatus })
  @IsEnum(DocumentImportStatus)
  status!: DocumentImportStatus;

  @ApiProperty()
  @IsBoolean()
  completed!: boolean;

  @ApiProperty()
  @IsBoolean()
  failed!: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tipoDocumento?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tipoDocumentoDescricao?: string;

  @ApiPropertyOptional({ type: () => DocumentAnalysisResponseDto })
  @ValidateNested()
  @Type(() => DocumentAnalysisResponseDto)
  @IsOptional()
  analysis?: DocumentAnalysisResponseDto;

  @ApiPropertyOptional({ type: () => DocumentValidationResultDto })
  @ValidateNested()
  @Type(() => DocumentValidationResultDto)
  @IsOptional()
  validation?: DocumentValidationResultDto;

  @ApiPropertyOptional({ type: () => DocumentImportMetadataDto })
  @ValidateNested()
  @Type(() => DocumentImportMetadataDto)
  @IsOptional()
  metadata?: DocumentImportMetadataDto;

  @ApiProperty({ type: () => DocumentImportJobSnapshotDto })
  @ValidateNested()
  @Type(() => DocumentImportJobSnapshotDto)
  job!: DocumentImportJobSnapshotDto;

  @ApiProperty({
    example: '/documents/import/11111111-1111-4111-8111-111111111111/status',
  })
  @IsString()
  statusUrl!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  message?: string;
}

type QueueSnapshotInput = {
  jobId?: string | null;
  queueState?: string | null;
  attemptsMade?: number;
  maxAttempts?: number;
  lastAttemptAt?: Date | string | null;
  deadLettered?: boolean;
};

type StatusResponseInput = {
  documentId: string;
  status: DocumentImportStatus;
  statusUrl: string;
  tipoDocumento?: string;
  tipoDocumentoDescricao?: string;
  analysis?: DocumentAnalysisResponseDto;
  validation?: DocumentValidationResultDto;
  metadata?: DocumentImportMetadataDto;
  job: QueueSnapshotInput;
  message?: string;
};

type ReplayState = 'new' | 'in_progress' | 'completed' | 'failed';

function serializeDateLike(value: Date | string | null | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  return value ?? null;
}

export function toDocumentImportJobSnapshotDto(
  input: QueueSnapshotInput,
): DocumentImportJobSnapshotDto {
  return {
    jobId: input.jobId ?? null,
    queueState: input.queueState ?? null,
    attemptsMade: input.attemptsMade,
    maxAttempts: input.maxAttempts,
    lastAttemptAt: serializeDateLike(input.lastAttemptAt),
    deadLettered: Boolean(input.deadLettered),
  };
}

export function toDocumentImportEnqueueResponseDto(input: {
  documentId: string;
  status: DocumentImportStatus;
  statusUrl: string;
  job: QueueSnapshotInput;
  message?: string;
  queued?: boolean;
  reused?: boolean;
  replayState?: ReplayState;
  dedupeSource?: 'idempotency_key' | 'file_hash';
  idempotencyKey?: string | null;
}): DocumentImportEnqueueResponseDto {
  return {
    success: true,
    queued: input.queued ?? true,
    documentId: input.documentId,
    status: input.status,
    statusUrl: input.statusUrl,
    job: toDocumentImportJobSnapshotDto(input.job),
    reused: input.reused ?? false,
    replayState: input.replayState ?? 'new',
    dedupeSource: input.dedupeSource,
    idempotencyKey: input.idempotencyKey ?? null,
    message: input.message,
  };
}

export function toDocumentImportStatusResponseDto(
  input: StatusResponseInput,
): DocumentImportStatusResponseDto {
  const completed = input.status === DocumentImportStatus.COMPLETED;
  const failed =
    input.status === DocumentImportStatus.FAILED ||
    input.status === DocumentImportStatus.DEAD_LETTER;

  return {
    success: true,
    documentId: input.documentId,
    status: input.status,
    completed,
    failed,
    tipoDocumento: input.tipoDocumento,
    tipoDocumentoDescricao: input.tipoDocumentoDescricao,
    analysis: input.analysis,
    validation: input.validation,
    metadata: input.metadata,
    job: toDocumentImportJobSnapshotDto(input.job),
    statusUrl: input.statusUrl,
    message: input.message,
  };
}
