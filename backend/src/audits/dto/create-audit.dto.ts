import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsUUID,
  IsArray,
  IsObject,
} from 'class-validator';

export class CreateAuditDto {
  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsDateString()
  @IsNotEmpty()
  data_auditoria: string;

  @IsString()
  @IsNotEmpty()
  tipo_auditoria: string;

  @IsUUID()
  @IsNotEmpty()
  site_id: string;

  @IsUUID()
  @IsNotEmpty()
  auditor_id: string;

  @IsString()
  @IsOptional()
  representantes_empresa?: string;

  @IsString()
  @IsOptional()
  objetivo?: string;

  @IsString()
  @IsOptional()
  escopo?: string;

  @IsArray()
  @IsOptional()
  referencias?: string[];

  @IsString()
  @IsOptional()
  metodologia?: string;

  @IsObject()
  @IsOptional()
  caracterizacao?: {
    cnae?: string;
    grau_risco?: string;
    num_trabalhadores?: number;
    turnos?: string;
    atividades_principais?: string;
  };

  @IsArray()
  @IsOptional()
  documentos_avaliados?: string[];

  @IsArray()
  @IsOptional()
  resultados_conformidades?: string[];

  @IsArray()
  @IsOptional()
  resultados_nao_conformidades?: {
    descricao: string;
    requisito: string;
    evidencia: string;
    classificacao: 'Leve' | 'Moderada' | 'Grave' | 'Crítica';
  }[];

  @IsArray()
  @IsOptional()
  resultados_observacoes?: string[];

  @IsArray()
  @IsOptional()
  resultados_oportunidades?: string[];

  @IsArray()
  @IsOptional()
  avaliacao_riscos?: {
    perigo: string;
    classificacao: string;
    impactos: string;
    medidas_controle: string;
  }[];

  @IsArray()
  @IsOptional()
  plano_acao?: {
    item: string;
    acao: string;
    responsavel: string;
    prazo: string;
    status: string;
  }[];

  @IsString()
  @IsOptional()
  conclusao?: string;
}

export class UpdateAuditDto extends CreateAuditDto {}
