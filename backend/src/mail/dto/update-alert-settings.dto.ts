import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  Max,
  Min,
  MaxLength,
  IsString,
  IsDateString,
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
    description: 'Incluir bloco de conformidade (EPIs e treinamentos)',
  })
  @IsOptional()
  @IsBoolean()
  includeComplianceSummary?: boolean;

  @ApiPropertyOptional({
    description: 'Incluir bloco operacional (PT, APR, checklist e DDS)',
  })
  @IsOptional()
  @IsBoolean()
  includeOperationsSummary?: boolean;

  @ApiPropertyOptional({
    description: 'Incluir bloco de ocorrências (NCs e ações pendentes)',
  })
  @IsOptional()
  @IsBoolean()
  includeOccurrencesSummary?: boolean;

  @ApiPropertyOptional({
    description: 'Hora do disparo automático (0-23)',
    minimum: 0,
    maximum: 23,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  deliveryHour?: number;

  @ApiPropertyOptional({
    description: 'Enviar automático apenas em dias úteis',
  })
  @IsOptional()
  @IsBoolean()
  weekdaysOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Cadência do envio automático em dias',
    minimum: 1,
    maximum: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  cadenceDays?: number;

  @ApiPropertyOptional({
    description: 'Pular envio automático quando não houver pendências',
  })
  @IsOptional()
  @IsBoolean()
  skipWhenNoPending?: boolean;

  @ApiPropertyOptional({
    description: 'Prefixo opcional para assunto dos alertas',
    maxLength: 60,
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  subjectPrefix?: string | null;

  @ApiPropertyOptional({
    description: 'Quantidade mínima de pendências para enviar alerta automático',
    minimum: 0,
    maximum: 999,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  minimumPendingItems?: number;

  @ApiPropertyOptional({
    description: 'Pausa alertas automáticos até data/hora ISO',
  })
  @IsOptional()
  @IsDateString()
  snoozeUntil?: string | null;

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
