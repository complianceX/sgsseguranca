import { Allow, IsString, IsOptional, IsObject, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadDocumentDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Arquivo a ser importado.',
  })
  @Allow()
  file!: unknown;

  // Importante: em ambiente multi-tenant, o empresaId vem do contexto do token.
  // Mantemos este campo como opcional apenas para compatibilidade de clientes antigos.
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Empresa alvo da importação. Campo legado, usado apenas quando o tenant não vier do contexto autenticado.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'O ID da empresa deve ser um UUID válido' })
  empresaId?: string;

  @ApiPropertyOptional({
    description: 'Tipo documental sugerido para o parser.',
    example: 'APR',
  })
  @IsOptional()
  @IsString({ message: 'O tipo de documento deve ser uma string' })
  tipoDocumento?: string;

  @ApiPropertyOptional({
    description: 'Chave formal de idempotência da operação.',
    example: '7d0d90d7-0a68-4b2a-b9c8-2cb5cfb9f979',
  })
  @IsOptional()
  @IsString({ message: 'A idempotencyKey deve ser uma string' })
  idempotencyKey?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Metadados livres anexados à operação.',
  })
  @IsOptional()
  @IsObject({ message: 'Metadados devem ser um objeto' })
  metadados?: Record<string, unknown>;
}
