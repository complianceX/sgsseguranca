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
} from 'class-validator';
import { Type } from 'class-transformer';

export class HeightChecklistItemDto {
  @IsString()
  id: string;

  @IsString()
  pergunta: string;

  @IsOptional()
  @IsEnum(['Sim', 'Não', 'Não aplicável'])
  resposta?: 'Sim' | 'Não' | 'Não aplicável';

  @IsOptional()
  @IsString()
  justificativa?: string;

  @IsOptional()
  @IsString()
  anexo_nome?: string;
}

export class RecommendationChecklistItemDto {
  @IsString()
  id: string;

  @IsString()
  pergunta: string;

  @IsOptional()
  @IsEnum(['Ciente', 'Não'])
  resposta?: 'Ciente' | 'Não';

  @IsOptional()
  @IsString()
  justificativa?: string;
}

export class RapidRiskChecklistItemDto {
  @IsString()
  id: string;

  @IsString()
  pergunta: string;

  @IsEnum(['basica', 'adicional'])
  secao: 'basica' | 'adicional';

  @IsOptional()
  @IsEnum(['Sim', 'Não'])
  resposta?: 'Sim' | 'Não';
}

export class CreatePtDto {
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
  data_hora_inicio: string;

  @IsDateString()
  @IsNotEmpty()
  data_hora_fim: string;

  @IsString()
  @IsOptional()
  @IsEnum(['Pendente', 'Aprovada', 'Cancelada', 'Encerrada', 'Expirada'])
  status?: string;

  @IsUUID()
  @IsNotEmpty()
  site_id: string;

  @IsUUID()
  @IsOptional()
  apr_id?: string;

  @IsUUID()
  @IsNotEmpty()
  responsavel_id: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  executantes?: string[];

  @IsBoolean()
  @IsOptional()
  trabalho_altura?: boolean;

  @IsBoolean()
  @IsOptional()
  espaco_confinado?: boolean;

  @IsBoolean()
  @IsOptional()
  trabalho_quente?: boolean;

  @IsBoolean()
  @IsOptional()
  eletricidade?: boolean;

  @IsBoolean()
  @IsOptional()
  escavacao?: boolean;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  probability?: number;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  severity?: number;

  @IsInt()
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeightChecklistItemDto)
  trabalho_altura_checklist?: HeightChecklistItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeightChecklistItemDto)
  trabalho_eletrico_checklist?: HeightChecklistItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeightChecklistItemDto)
  trabalho_quente_checklist?: HeightChecklistItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeightChecklistItemDto)
  trabalho_espaco_confinado_checklist?: HeightChecklistItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeightChecklistItemDto)
  trabalho_escavacao_checklist?: HeightChecklistItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendationChecklistItemDto)
  recomendacoes_gerais_checklist?: RecommendationChecklistItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RapidRiskChecklistItemDto)
  analise_risco_rapida_checklist?: RapidRiskChecklistItemDto[];

  @IsString()
  @IsOptional()
  analise_risco_rapida_observacoes?: string;

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
