import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsUUID,
  IsIn,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const OS_STATUSES = ['ativo', 'concluido', 'cancelado'];

export class RiscoIdentificadoDto {
  @IsString()
  @IsNotEmpty()
  risco: string;

  @IsString()
  @IsNotEmpty()
  medida_controle: string;
}

export class EpiNecessarioDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsString()
  @IsOptional()
  ca: string;
}

export class CreateServiceOrderDto {
  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsString()
  @IsNotEmpty()
  descricao_atividades: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RiscoIdentificadoDto)
  @IsOptional()
  riscos_identificados?: RiscoIdentificadoDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EpiNecessarioDto)
  @IsOptional()
  epis_necessarios?: EpiNecessarioDto[];

  @IsString()
  @IsOptional()
  responsabilidades?: string;

  @IsIn(OS_STATUSES)
  @IsOptional()
  status?: string;

  @IsDateString()
  @IsNotEmpty()
  data_emissao: string;

  @IsDateString()
  @IsOptional()
  data_inicio?: string;

  @IsDateString()
  @IsOptional()
  data_fim_previsto?: string;

  @IsUUID()
  @IsOptional()
  responsavel_id?: string;

  @IsUUID()
  @IsOptional()
  site_id?: string;

  @IsUUID()
  @IsOptional()
  company_id?: string;
}
