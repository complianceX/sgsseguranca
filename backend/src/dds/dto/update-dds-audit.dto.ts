import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
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
  notas_auditoria?: string;
}
