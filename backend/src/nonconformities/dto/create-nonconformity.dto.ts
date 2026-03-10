import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateNonConformityDto {
  @IsString()
  @IsNotEmpty()
  codigo_nc: string;

  @IsString()
  @IsNotEmpty()
  tipo: string;

  @IsDateString()
  @IsNotEmpty()
  data_identificacao: string;

  @IsString()
  @IsNotEmpty()
  local_setor_area: string;

  @IsString()
  @IsNotEmpty()
  atividade_envolvida: string;

  @IsString()
  @IsNotEmpty()
  responsavel_area: string;

  @IsString()
  @IsNotEmpty()
  auditor_responsavel: string;

  @IsArray()
  @IsOptional()
  classificacao?: string[];

  @IsString()
  @IsNotEmpty()
  descricao: string;

  @IsString()
  @IsNotEmpty()
  evidencia_observada: string;

  @IsString()
  @IsNotEmpty()
  condicao_insegura: string;

  @IsString()
  @IsOptional()
  ato_inseguro?: string;

  @IsString()
  @IsNotEmpty()
  requisito_nr: string;

  @IsString()
  @IsNotEmpty()
  requisito_item: string;

  @IsString()
  @IsOptional()
  requisito_procedimento?: string;

  @IsString()
  @IsOptional()
  requisito_politica?: string;

  @IsString()
  @IsNotEmpty()
  risco_perigo: string;

  @IsString()
  @IsNotEmpty()
  risco_associado: string;

  @IsArray()
  @IsOptional()
  risco_consequencias?: string[];

  @IsString()
  @IsNotEmpty()
  risco_nivel: string;

  @IsArray()
  @IsOptional()
  causa?: string[];

  @IsString()
  @IsOptional()
  causa_outro?: string;

  @IsString()
  @IsOptional()
  acao_imediata_descricao?: string;

  @IsDateString()
  @IsOptional()
  acao_imediata_data?: string;

  @IsString()
  @IsOptional()
  acao_imediata_responsavel?: string;

  @IsString()
  @IsOptional()
  acao_imediata_status?: string;

  @IsString()
  @IsOptional()
  acao_definitiva_descricao?: string;

  @IsDateString()
  @IsOptional()
  acao_definitiva_prazo?: string;

  @IsString()
  @IsOptional()
  acao_definitiva_responsavel?: string;

  @IsString()
  @IsOptional()
  acao_definitiva_recursos?: string;

  @IsDateString()
  @IsOptional()
  acao_definitiva_data_prevista?: string;

  @IsString()
  @IsOptional()
  acao_preventiva_medidas?: string;

  @IsString()
  @IsOptional()
  acao_preventiva_treinamento?: string;

  @IsString()
  @IsOptional()
  acao_preventiva_revisao_procedimento?: string;

  @IsString()
  @IsOptional()
  acao_preventiva_melhoria_processo?: string;

  @IsString()
  @IsOptional()
  acao_preventiva_epc_epi?: string;

  @IsString()
  @IsOptional()
  verificacao_resultado?: string;

  @IsString()
  @IsOptional()
  verificacao_evidencias?: string;

  @IsDateString()
  @IsOptional()
  verificacao_data?: string;

  @IsString()
  @IsOptional()
  verificacao_responsavel?: string;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsString()
  @IsOptional()
  observacoes_gerais?: string;

  @IsArray()
  @IsOptional()
  anexos?: string[];

  @IsString()
  @IsOptional()
  assinatura_responsavel_area?: string;

  @IsString()
  @IsOptional()
  assinatura_tecnico_auditor?: string;

  @IsString()
  @IsOptional()
  assinatura_gestao?: string;

  @IsUUID()
  @IsOptional()
  site_id?: string;
}

export class UpdateNonConformityDto extends PartialType(
  CreateNonConformityDto,
) {}
