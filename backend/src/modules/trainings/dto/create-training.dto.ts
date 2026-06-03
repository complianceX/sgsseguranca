import {
  IsBoolean,
  IsInt,
  IsString,
  IsNotEmpty,
  IsDateString,
  IsEmpty,
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

  @IsOptional()
  @IsEmpty({
    message:
      'company_id não é permitido no payload. O tenant autenticado define a empresa.',
  })
  company_id?: never;

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
