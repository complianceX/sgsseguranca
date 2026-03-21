import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type DocumentMailArtifactType =
  | 'governed_final_pdf'
  | 'local_uploaded_pdf';

export type DocumentMailDeliveryMode = 'queued' | 'sent';

export class DocumentMailDispatchResponseDto {
  @ApiProperty({
    description: 'Indica se o envio foi aceito com sucesso.',
    example: true,
  })
  success: true;

  @ApiProperty({
    description: 'Mensagem descritiva do resultado do envio.',
    example: 'E-mail enfileirado para envio.',
  })
  message: string;

  @ApiProperty({
    description: 'Modo de entrega do e-mail.',
    enum: ['queued', 'sent'],
    example: 'queued',
  })
  deliveryMode: DocumentMailDeliveryMode;

  @ApiProperty({
    description: 'Tipo de artefato anexado ao e-mail.',
    enum: ['governed_final_pdf', 'local_uploaded_pdf'],
    example: 'governed_final_pdf',
  })
  artifactType: DocumentMailArtifactType;

  @ApiProperty({
    description: 'Indica se o PDF usado é o oficial governado.',
    example: true,
  })
  isOfficial: boolean;

  @ApiProperty({
    description:
      'Indica se foi usado fallback (upload local em vez de PDF governado).',
    example: false,
  })
  fallbackUsed: boolean;

  @ApiPropertyOptional({
    description: 'Tipo do documento (apr, rdo, pt, etc.).',
    example: 'apr',
  })
  documentType?: string;

  @ApiPropertyOptional({
    description: 'ID do documento enviado.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  documentId?: string;

  @ApiPropertyOptional({
    description: 'Chave do arquivo no storage.',
    example: 'companies/abc/aprs/2025/file.pdf',
  })
  fileKey?: string;
}
