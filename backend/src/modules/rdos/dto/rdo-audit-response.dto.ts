import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RdoAuditResponseDto {
  @ApiProperty({ description: 'ID único do evento', format: 'uuid' })
  id: string;

  @ApiProperty({
    description: 'Tipo de evento de auditoria',
    example: 'STATUS_CHANGED',
  })
  eventType: string;

  @ApiProperty({
    description: 'Rótulo formatado legível do evento',
    example: 'Status Alterado',
  })
  eventLabel: string;

  @ApiPropertyOptional({
    description: 'ID do usuário que originou o evento (se aplicável)',
    format: 'uuid',
  })
  userId?: string;

  @ApiProperty({ description: 'Data e hora de ocorrência do evento' })
  createdAt: Date;

  @ApiPropertyOptional({
    description:
      'Detalhes adicionais em formato JSON livre (ex: status anterior e atual, nome do PDF gerado, tipo de assinatura)',
    example: { previousStatus: 'rascunho', newStatus: 'enviado' },
  })
  details?: Record<string, unknown>;
}
