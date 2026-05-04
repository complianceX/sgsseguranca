import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AuditResult } from '../entities/dds.entity';

export class UpdateDdsAuditDto {
  @IsUUID()
  @IsNotEmpty()
  auditado_por_id: string;

  @IsDateString()
  @IsNotEmpty()
  data_auditoria: string;

  @IsEnum(AuditResult)
  @IsNotEmpty()
  resultado_auditoria: AuditResult;

  @IsString()
  @IsOptional()
  @MaxLength(5_000)
  notas_auditoria?: string;
}
