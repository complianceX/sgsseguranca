import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsUUID,
  IsArray,
  IsEnum,
  IsBoolean,
  IsObject,
  IsInt,
  Min,
  Max,
} from 'class-validator';

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
  @IsObject({ each: true })
  trabalho_altura_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  trabalho_eletrico_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  trabalho_quente_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  trabalho_espaco_confinado_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  trabalho_escavacao_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Sim' | 'Não' | 'Não aplicável';
    justificativa?: string;
    anexo_nome?: string;
  }>;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  recomendacoes_gerais_checklist?: Array<{
    id: string;
    pergunta: string;
    resposta?: 'Ciente' | 'Não';
    justificativa?: string;
  }>;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  analise_risco_rapida_checklist?: Array<{
    id: string;
    pergunta: string;
    secao: 'basica' | 'adicional';
    resposta?: 'Sim' | 'Não';
  }>;

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
