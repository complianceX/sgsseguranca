import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

class PerigoRiscoDto {
  @IsString()
  @IsNotEmpty()
  grupo_risco: string;

  @IsString()
  @IsNotEmpty()
  perigo_fator_risco: string;

  @IsString()
  @IsNotEmpty()
  fonte_circunstancia: string;

  @IsString()
  @IsNotEmpty()
  trabalhadores_expostos: string;

  @IsString()
  @IsNotEmpty()
  tipo_exposicao: string;

  @IsString()
  @IsNotEmpty()
  medidas_existentes: string;

  @IsString()
  @IsNotEmpty()
  severidade: string;

  @IsString()
  @IsNotEmpty()
  probabilidade: string;

  @IsString()
  @IsNotEmpty()
  nivel_risco: string;

  @IsString()
  @IsNotEmpty()
  classificacao_risco: string;

  @IsString()
  @IsNotEmpty()
  acoes_necessarias: string;

  @IsString()
  @IsNotEmpty()
  prazo: string;

  @IsString()
  @IsNotEmpty()
  responsavel: string;
}

class PlanoAcaoDto {
  @IsString()
  @IsNotEmpty()
  acao: string;

  @IsString()
  @IsNotEmpty()
  responsavel: string;

  @IsString()
  @IsNotEmpty()
  prazo: string;

  @IsString()
  @IsNotEmpty()
  status: string;
}

class EvidenciaDto {
  @IsString()
  @IsNotEmpty()
  descricao: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  original_name?: string;
}

export class CreateInspectionDto {
  @IsUUID()
  @IsNotEmpty()
  site_id: string;

  @IsString()
  @IsNotEmpty()
  setor_area: string;

  @IsString()
  @IsNotEmpty()
  tipo_inspecao: string;

  @IsDateString()
  @IsNotEmpty()
  data_inspecao: string;

  @IsString()
  @IsNotEmpty()
  horario: string;

  @IsUUID()
  @IsNotEmpty()
  responsavel_id: string;

  @IsString()
  @IsOptional()
  objetivo?: string;

  @IsString()
  @IsOptional()
  descricao_local_atividades?: string;

  @IsArray()
  @IsOptional()
  metodologia?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerigoRiscoDto)
  @IsOptional()
  perigos_riscos?: PerigoRiscoDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanoAcaoDto)
  @IsOptional()
  plano_acao?: PlanoAcaoDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvidenciaDto)
  @IsOptional()
  evidencias?: EvidenciaDto[];

  @IsString()
  @IsOptional()
  conclusao?: string;
}

export class UpdateInspectionDto extends PartialType(CreateInspectionDto) {}
