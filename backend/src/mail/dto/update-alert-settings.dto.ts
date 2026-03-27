import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

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

  @ApiPropertyOptional({
    description: 'Janela de antecedência dos alertas em dias',
    minimum: 1,
    maximum: 120,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  lookaheadDays?: number;
}
