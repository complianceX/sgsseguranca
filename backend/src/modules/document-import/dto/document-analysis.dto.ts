import {
  IsString,
  IsOptional,
  IsArray,
  IsDate,
  IsDateString,
  IsNumber,
  IsEnum,
  IsObject,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentImportStatus } from '../entities/document-import-status.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DocumentAnalysisDto {
  @IsString()
  @IsOptional()
  empresa?: string;

  @IsString()
  @IsOptional()
  cnpj?: string;

  @IsDate()
  @IsOptional()
  data?: Date | null;

  @IsString()
  @IsOptional()
  responsavelTecnico?: string;

  @IsString()
  @IsOptional()
  responsavel?: string;

  @IsArray()
  @IsOptional()
  nrsCitadas?: string[];

  @IsArray()
  @IsOptional()
  riscos?: string[];

  @IsArray()
  @IsOptional()
  epis?: string[];

  @IsArray()
  @IsOptional()
  assinaturas?: string[];

  @IsString()
  @IsOptional()
  tipoDocumento?: string;

  @IsString()
  @IsOptional()
  tema?: string;

  @IsString()
  @IsOptional()
  conteudo?: string;

  @IsString()
  @IsOptional()
  resumo?: string;

  @IsString()
  @IsOptional()
  site_id?: string;

  @IsString()
  @IsOptional()
  facilitador_id?: string;

  @IsNumber()
  @IsOptional()
  scoreConfianca?: number;

  @IsObject()
  @IsOptional()
  camposEstruturados?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  tipoNormalizado?: string;
}

export enum DocumentValidationStatus {
  VALIDO = 'VALIDO',
  INCOMPLETO = 'INCOMPLETO',
  CRITICO = 'CRITICO',
}

export class DocumentValidationResultDto {
  @ApiProperty({ enum: DocumentValidationStatus })
  @IsEnum(DocumentValidationStatus)
  status!: DocumentValidationStatus;

  @ApiProperty({ type: [String] })
  @IsArray()
  pendencias!: string[];

  @ApiProperty()
  @IsNumber()
  scoreConfianca!: number;
}

export class DocumentAnalysisResponseDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  empresa?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  cnpj?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  @IsDateString()
  @IsOptional()
  data?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  responsavelTecnico?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  responsavel?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  nrsCitadas!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  riscos!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  epis!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  assinaturas!: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tipoDocumento?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tema?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  conteudo?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  resumo?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  site_id?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  facilitador_id?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  scoreConfianca?: number;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @IsOptional()
  camposEstruturados?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tipoNormalizado?: string;
}

export class DocumentImportAutoCreateDdsMetadataDto {
  @ApiProperty({ enum: ['pending', 'created', 'failed'] })
  @IsString()
  state!: 'pending' | 'created' | 'failed';

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  requestedAt?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  completedAt?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  ddsId?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  error?: string;
}

export class DocumentImportMetadataDto {
  @ApiProperty()
  @IsNumber()
  tamanhoArquivo!: number;

  @ApiProperty()
  @IsNumber()
  quantidadeTexto!: number;

  @ApiProperty()
  @IsString()
  hash!: string;

  @ApiProperty()
  @IsDateString()
  timestamp!: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  scoreClassificacao?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  textoExtraidoLength?: number;

  @ApiPropertyOptional({ type: () => DocumentValidationResultDto })
  @ValidateNested()
  @Type(() => DocumentValidationResultDto)
  @IsOptional()
  validacao?: DocumentValidationResultDto;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  erro?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  timestampFalha?: string;

  @ApiPropertyOptional({ enum: DocumentImportStatus })
  @IsEnum(DocumentImportStatus)
  @IsOptional()
  status?: DocumentImportStatus;

  @ApiPropertyOptional({
    type: () => DocumentImportAutoCreateDdsMetadataDto,
  })
  @ValidateNested()
  @Type(() => DocumentImportAutoCreateDdsMetadataDto)
  @IsOptional()
  autoCreateDds?: DocumentImportAutoCreateDdsMetadataDto;
}

export class DocumentImportResponseDto {
  @ApiProperty()
  @IsBoolean()
  success!: boolean;

  @ApiProperty({ format: 'uuid' })
  @IsString()
  documentId!: string;

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

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  mensagem?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  textoExtraido?: string;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function serializeDateLike(value: unknown): string | null | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  return value === null ? null : undefined;
}

export function toDocumentValidationSnapshotDto(
  validation?: DocumentValidationResultDto,
): DocumentValidationResultDto | undefined {
  if (!validation) {
    return undefined;
  }

  return {
    status: validation.status,
    pendencias: normalizeStringArray(validation.pendencias),
    scoreConfianca: Number(validation.scoreConfianca || 0),
  };
}

export function toDocumentAnalysisResponseDto(
  analysis?: DocumentAnalysisDto,
): DocumentAnalysisResponseDto | undefined {
  if (!analysis) {
    return undefined;
  }

  return {
    empresa: analysis.empresa,
    cnpj: analysis.cnpj,
    data: serializeDateLike(analysis.data),
    responsavelTecnico: analysis.responsavelTecnico,
    responsavel: analysis.responsavel,
    nrsCitadas: normalizeStringArray(analysis.nrsCitadas),
    riscos: normalizeStringArray(analysis.riscos),
    epis: normalizeStringArray(analysis.epis),
    assinaturas: normalizeStringArray(analysis.assinaturas),
    tipoDocumento: analysis.tipoDocumento,
    tema: analysis.tema,
    conteudo: analysis.conteudo,
    resumo: analysis.resumo,
    site_id: analysis.site_id,
    facilitador_id: analysis.facilitador_id,
    scoreConfianca: analysis.scoreConfianca,
    camposEstruturados: analysis.camposEstruturados,
    tipoNormalizado: analysis.tipoNormalizado,
  };
}

export function toDocumentImportResponseDto(input: {
  success: boolean;
  documentId: string;
  tipoDocumento?: string;
  tipoDocumentoDescricao?: string;
  analysis?: DocumentAnalysisDto;
  validation?: DocumentValidationResultDto;
  metadata?: {
    tamanhoArquivo: number;
    quantidadeTexto: number;
    hash: string;
    timestamp: Date | string;
    scoreClassificacao?: number;
    textoExtraidoLength?: number;
    validacao?: DocumentValidationResultDto;
    erro?: string;
    timestampFalha?: Date | string;
    status?: DocumentImportStatus;
    autoCreateDds?: {
      state: 'pending' | 'created' | 'failed';
      requestedAt?: Date | string;
      completedAt?: Date | string;
      ddsId?: string | null;
      error?: string;
    };
  };
  mensagem?: string;
  textoExtraido?: string;
}): DocumentImportResponseDto {
  return {
    success: input.success,
    documentId: input.documentId,
    tipoDocumento: input.tipoDocumento,
    tipoDocumentoDescricao: input.tipoDocumentoDescricao,
    analysis: toDocumentAnalysisResponseDto(input.analysis),
    validation: toDocumentValidationSnapshotDto(input.validation),
    metadata: input.metadata
      ? {
          tamanhoArquivo: input.metadata.tamanhoArquivo,
          quantidadeTexto: input.metadata.quantidadeTexto,
          hash: input.metadata.hash,
          timestamp:
            serializeDateLike(input.metadata.timestamp) ||
            new Date().toISOString(),
          scoreClassificacao: input.metadata.scoreClassificacao,
          textoExtraidoLength: input.metadata.textoExtraidoLength,
          validacao: toDocumentValidationSnapshotDto(input.metadata.validacao),
          erro: input.metadata.erro,
          timestampFalha:
            serializeDateLike(input.metadata.timestampFalha) || undefined,
          status: input.metadata.status,
          autoCreateDds: input.metadata.autoCreateDds
            ? {
                state: input.metadata.autoCreateDds.state,
                requestedAt:
                  serializeDateLike(input.metadata.autoCreateDds.requestedAt) ||
                  undefined,
                completedAt:
                  serializeDateLike(input.metadata.autoCreateDds.completedAt) ||
                  undefined,
                ddsId: input.metadata.autoCreateDds.ddsId ?? null,
                error: input.metadata.autoCreateDds.error,
              }
            : undefined,
        }
      : undefined,
    mensagem: input.mensagem,
    textoExtraido: input.textoExtraido,
  };
}
