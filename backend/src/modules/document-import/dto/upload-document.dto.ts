import { Transform } from 'class-transformer';
import {
  Allow,
  IsEmpty,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const DOCUMENT_IMPORT_ALLOWED_TYPES = [
  'DDS',
  'APR',
  'PT',
  'PGR',
  'PCMSO',
  'ASO',
  'CHECKLIST',
  'INSPECTION',
  'NC',
  'DESCONHECIDO',
] as const;

const normalizeOptionalUppercase = ({
  value,
}: {
  value: unknown;
}): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeOptionalTrimmed = ({
  value,
}: {
  value: unknown;
}): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

@ValidatorConstraint({ name: 'DocumentImportMetadataShape', async: false })
class DocumentImportMetadataShapeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined) {
      return true;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length > 20) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      return serialized.length <= 2048;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'Metadados devem ser um objeto JSON simples com no máximo 20 chaves e 2048 caracteres.';
  }
}

export class UploadDocumentDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Arquivo a ser importado.',
  })
  @Allow()
  file!: unknown;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Campo legado descontinuado. Use o header x-company-id para Admin Geral.',
    deprecated: true,
  })
  @IsOptional()
  @IsEmpty({
    message:
      'empresaId não é mais aceito no payload. Use o header x-company-id.',
  })
  empresaId?: string;

  @ApiPropertyOptional({
    description: 'Tipo documental sugerido para o parser.',
    example: 'APR',
  })
  @IsOptional()
  @Transform(normalizeOptionalUppercase)
  @IsString({ message: 'O tipo de documento deve ser uma string' })
  @IsIn(DOCUMENT_IMPORT_ALLOWED_TYPES, {
    message: 'Tipo de documento inválido para importação.',
  })
  tipoDocumento?: string;

  @ApiPropertyOptional({
    description: 'Chave formal de idempotência da operação.',
    example: '7d0d90d7-0a68-4b2a-b9c8-2cb5cfb9f979',
  })
  @IsOptional()
  @Transform(normalizeOptionalTrimmed)
  @IsString({ message: 'A idempotencyKey deve ser uma string' })
  @MaxLength(128, {
    message: 'A idempotencyKey deve ter no máximo 128 caracteres.',
  })
  @Matches(/^[A-Za-z0-9._:-]+$/, {
    message:
      'A idempotencyKey contém caracteres inválidos. Use apenas letras, números, ".", "_", ":" ou "-".',
  })
  idempotencyKey?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Metadados livres anexados à operação.',
  })
  @IsOptional()
  @IsObject({ message: 'Metadados devem ser um objeto' })
  @Validate(DocumentImportMetadataShapeConstraint)
  metadados?: Record<string, unknown>;
}
