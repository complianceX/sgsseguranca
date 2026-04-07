import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsUUID,
  IsArray,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { AuditResult } from '../entities/dds.entity';

export class CreateDdsDto {
  @IsString()
  @IsNotEmpty()
  tema: string;

  @IsString()
  @IsOptional()
  conteudo?: string;

  @IsDateString()
  @IsNotEmpty()
  data: string;

  @IsBoolean()
  @IsOptional()
  is_modelo?: boolean;

  @IsUUID()
  @IsOptional()
  company_id?: string;

  @IsUUID()
  @IsNotEmpty()
  site_id: string;

  @IsUUID()
  @IsNotEmpty()
  facilitador_id: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
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
  notas_auditoria?: string;
}
