import {
  IsBoolean,
  IsInt,
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateTrainingDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsString()
  @IsOptional()
  nr_codigo?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  carga_horaria?: number;

  @IsBoolean()
  @IsOptional()
  obrigatorio_para_funcao?: boolean;

  @IsBoolean()
  @IsOptional()
  bloqueia_operacao_quando_vencido?: boolean;

  @IsDateString()
  @IsNotEmpty()
  data_conclusao: string;

  @IsDateString()
  @IsNotEmpty()
  data_vencimento: string;

  @IsString()
  @IsOptional()
  certificado_url?: string;

  @IsUUID()
  @IsNotEmpty()
  user_id: string;

  @IsUUID()
  @IsOptional()
  company_id?: string;

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
