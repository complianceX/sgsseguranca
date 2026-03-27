import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEmail, IsOptional } from 'class-validator';

export class UpdateAlertSettingsDto {
  @ApiPropertyOptional({
    description: 'Ativa o disparo automático de alertas para a empresa',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Lista padrão de e-mails para alertas',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  recipients?: string[];

  @ApiPropertyOptional({
    description: 'Habilita WhatsApp por padrão para os alertas',
  })
  @IsOptional()
  @IsBoolean()
  includeWhatsapp?: boolean;
}
