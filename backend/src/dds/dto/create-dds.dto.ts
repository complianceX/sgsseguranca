import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsEmpty,
  IsUUID,
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { AuditResult } from '../entities/dds.entity';

export class CreateDdsDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  tema: string;

  @IsString()
  @IsOptional()
  @MaxLength(50000) // 50KB máximo para conteúdo
  conteudo?: string;

  @IsDateString()
  @IsNotEmpty()
  data: string;

  @IsBoolean()
  @IsOptional()
  is_modelo?: boolean;

  @IsOptional()
  @IsEmpty({
    message:
      'company_id não é permitido no payload. O tenant autenticado define a empresa.',
  })
  company_id?: never;

  @IsUUID()
  @IsNotEmpty()
  site_id: string;

  @IsUUID()
  @IsNotEmpty()
  facilitador_id: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  @ArrayMaxSize(50) // Máximo 50 participantes
  participants?: string[];

  @IsUUID()
  @IsOptional()
  auditado_por_id?: string;

  @IsDateString()
  @IsOptional()
  data_auditoria?: string;

  @IsEnum(AuditResult)
  @IsOptional()
  resultado_auditoria?: AuditResult;

  @IsString()
  @IsOptional()
  @MaxLength(5_000)
  notas_auditoria?: string;
}
