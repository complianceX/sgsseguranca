import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AprRiskItemInputDto {
  @IsString()
  @IsOptional()
  atividade_processo?: string;

  @IsString()
  @IsOptional()
  atividade?: string;

  @IsString()
  @IsOptional()
  agente_ambiental?: string;

  @IsString()
  @IsOptional()
  condicao_perigosa?: string;

  @IsString()
  @IsOptional()
  fonte_circunstancia?: string;

  @IsString()
  @IsOptional()
  fontes_circunstancias?: string;

  @IsString()
  @IsOptional()
  possiveis_lesoes?: string;

  @IsString()
  @IsOptional()
  lesao?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  @IsOptional()
  probabilidade?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  @IsOptional()
  severidade?: number;

  @IsString()
  @IsOptional()
  categoria_risco?: string;

  @IsString()
  @IsOptional()
  medidas_prevencao?: string;

  @IsString()
  @IsOptional()
  responsavel?: string;

  @IsDateString()
  @IsOptional()
  prazo?: string;

  @IsString()
  @IsOptional()
  status_acao?: string;
}
