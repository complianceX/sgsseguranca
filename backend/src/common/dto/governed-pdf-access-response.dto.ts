import { ApiProperty } from '@nestjs/swagger';

/**
 * Valores possíveis para disponibilidade de PDF governado.
 *
 * - `ready` — PDF final disponível com rota restrita de download emitida pelo backend.
 * - `registered_without_signed_url` — PDF existe no registro mas o storage
 *   não retornou uma rota de download temporária (indisponível temporariamente).
 * - `not_emitted` — PDF final ainda não foi gerado/armazenado.
 */
export type GovernedPdfAccessAvailability =
  | 'ready'
  | 'registered_without_signed_url'
  | 'not_emitted';

/**
 * DTO canônico para resposta de acesso a PDF governado.
 *
 * Todos os módulos que expõem `GET /:id/pdf` devem retornar esta forma
 * (opcionalmente estendida com campos extras do módulo).
 *
 * Campos nullable (message, fileKey, folderPath, originalName, url) são
 * sempre retornados pelo backend — são `null` quando não disponíveis,
 * nunca omitidos. Por isso usam `@ApiProperty({ nullable: true })` e não
 * `@ApiPropertyOptional`.
 */
export class GovernedPdfAccessResponseDto {
  @ApiProperty({
    description: 'Identificador da entidade dona do PDF.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  entityId: string;

  @ApiProperty({
    description: 'Indica se o PDF final já foi gerado e registrado.',
    example: true,
  })
  hasFinalPdf: boolean;

  @ApiProperty({
    description: 'Estado de disponibilidade do PDF no storage.',
    enum: ['ready', 'registered_without_signed_url', 'not_emitted'],
    example: 'ready',
  })
  availability: GovernedPdfAccessAvailability;

  @ApiProperty({
    type: 'string',
    description:
      'Mensagem informativa sobre o estado do PDF (motivo de indisponibilidade, etc.).',
    example: null,
    nullable: true,
  })
  message: string | null;

  @ApiProperty({
    type: 'string',
    description: 'Chave do arquivo no bucket S3/storage.',
    example: 'companies/abc/aprs/2025/file.pdf',
    nullable: true,
  })
  fileKey: string | null;

  @ApiProperty({
    type: 'string',
    description: 'Caminho da pasta no storage.',
    example: 'companies/abc/aprs/2025/',
    nullable: true,
  })
  folderPath: string | null;

  @ApiProperty({
    type: 'string',
    description: 'Nome original do arquivo.',
    example: 'APR-202503-001.pdf',
    nullable: true,
  })
  originalName: string | null;

  @ApiProperty({
    type: 'string',
    description:
      'Rota temporária e restrita do backend para download do PDF oficial (presente quando availability = ready).',
    example: 'https://api.example.com/storage/download/<token>',
    nullable: true,
  })
  url: string | null;
}
