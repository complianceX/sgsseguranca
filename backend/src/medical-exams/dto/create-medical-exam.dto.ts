import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsUUID,
  IsIn,
} from 'class-validator';

const TIPOS_EXAME = ['admissional', 'periodico', 'retorno', 'demissional', 'mudanca_funcao'];
const RESULTADOS = ['apto', 'inapto', 'apto_com_restricoes'];

export class CreateMedicalExamDto {
  @IsIn(TIPOS_EXAME)
  @IsNotEmpty()
  tipo_exame: string;

  @IsIn(RESULTADOS)
  @IsNotEmpty()
  resultado: string;

  @IsDateString()
  @IsNotEmpty()
  data_realizacao: string;

  @IsDateString()
  @IsOptional()
  data_vencimento?: string;

  @IsString()
  @IsOptional()
  medico_responsavel?: string;

  @IsString()
  @IsOptional()
  crm_medico?: string;

  @IsString()
  @IsOptional()
  observacoes?: string;

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
