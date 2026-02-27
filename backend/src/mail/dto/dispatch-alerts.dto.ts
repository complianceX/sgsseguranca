import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DispatchAlertsDto {
  @ApiPropertyOptional({
    description: 'E-mails para envio (separados por vírgula)',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: 'Incluir envio via WhatsApp' })
  @IsOptional()
  @IsBoolean()
  includeWhatsapp?: boolean;
}
