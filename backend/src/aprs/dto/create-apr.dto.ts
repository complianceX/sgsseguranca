import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsUUID,
  IsArray,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  Max,
  ValidateNested,
  ArrayUnique,
} from 'class-validator';
import { AprRiskItemInputDto } from './apr-risk-item-input.dto';
import { AprStatus } from '../entities/apr.entity';

export class CreateAprDto {
  @IsString()
  @IsNotEmpty()
  numero: string;

  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsString()
  @IsOptional()
  descricao?: string;

  @IsDateString()
  @IsNotEmpty()
  data_inicio: string;

  @IsDateString()
  @IsNotEmpty()
  data_fim: string;

  @IsString()
  @IsOptional()
  @IsEnum(AprStatus)
  status?: AprStatus;

  @IsBoolean()
  @IsOptional()
  is_modelo?: boolean;

  @IsBoolean()
  @IsOptional()
  is_modelo_padrao?: boolean;

  @IsArray()
  @IsOptional()
  itens_risco?: Array<Record<string, string>>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AprRiskItemInputDto)
  @IsOptional()
  risk_items?: AprRiskItemInputDto[];

  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(5)
  @IsOptional()
  probability?: number;

  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(5)
  @IsOptional()
  severity?: number;

  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(5)
  @IsOptional()
  exposure?: number;

  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  @IsOptional()
  residual_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsString()
  @IsOptional()
  evidence_photo?: string;

  @IsString()
  @IsOptional()
  evidence_document?: string;

  @IsString()
  @IsOptional()
  control_description?: string;

  @IsBoolean()
  @IsOptional()
  control_evidence?: boolean;

  @IsUUID()
  @IsNotEmpty()
  site_id: string;

  @IsUUID()
  @IsNotEmpty()
  elaborador_id: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @IsOptional()
  activities?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @IsOptional()
  risks?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @IsOptional()
  epis?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @IsOptional()
  tools?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @IsOptional()
  machines?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @IsOptional()
  participants?: string[];

  @IsUUID()
  @IsOptional()
  auditado_por_id?: string;

  @IsDateString()
  @IsOptional()
  data_auditoria?: string;

  @IsString()
  @IsOptional()
  resultado_auditoria?: string;

  @IsString()
  @IsOptional()
  notas_auditoria?: string;
}
