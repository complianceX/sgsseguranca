import {
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsUUID,
  IsArray,
  IsBoolean,
  IsObject,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const AUDIT_NON_COMPLIANCE_CLASSIFICATIONS = [
  'Leve',
  'Moderada',
  'Grave',
  'Crítica',
] as const;

export type AuditNonComplianceClassification =
  (typeof AUDIT_NON_COMPLIANCE_CLASSIFICATIONS)[number];

const AUDIT_CHECKLIST_ANSWER_VALUES = ['sim', 'nao', 'na'] as const;
const AUDIT_CHECKLIST_CRITICALITIES = [
  'baixa',
  'media',
  'alta',
  'critica',
] as const;
const AUDIT_CHECKLIST_PHOTO_RULES = ['always', 'nao'] as const;
const AUDIT_CHECKLIST_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

class AuditCharacterizationDto {
  @IsString()
  @IsOptional()
  cnae?: string;

  @IsString()
  @IsOptional()
  grau_risco?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  num_trabalhadores?: number;

  @IsString()
  @IsOptional()
  turnos?: string;

  @IsString()
  @IsOptional()
  atividades_principais?: string;
}

class AuditNonComplianceDto {
  @IsString()
  @IsNotEmpty()
  descricao: string;

  @IsString()
  @IsNotEmpty()
  requisito: string;

  @IsString()
  @IsNotEmpty()
  evidencia: string;

  @IsIn([...AUDIT_NON_COMPLIANCE_CLASSIFICATIONS])
  classificacao: AuditNonComplianceClassification;
}

class AuditRiskAssessmentDto {
  @IsString()
  @IsNotEmpty()
  perigo: string;

  @IsString()
  @IsNotEmpty()
  classificacao: string;

  @IsString()
  @IsNotEmpty()
  impactos: string;

  @IsString()
  @IsNotEmpty()
  medidas_controle: string;
}

class AuditActionPlanItemDto {
  @IsString()
  @IsNotEmpty()
  item: string;

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

class AuditChecklistEvidenceDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsIn([...AUDIT_CHECKLIST_IMAGE_MIME_TYPES])
  mimeType: (typeof AUDIT_CHECKLIST_IMAGE_MIME_TYPES)[number];

  @IsNumber()
  @Min(1)
  size: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(900_000)
  dataUrl: string;

  @IsDateString()
  capturedAt: string;

  @IsString()
  @IsOptional()
  hash?: string;
}

class AuditChecklistAnswerDto {
  @IsString()
  @IsNotEmpty()
  sectionId: string;

  @IsString()
  @IsNotEmpty()
  sectionTitle: string;

  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsNotEmpty()
  question: string;

  @IsString()
  @IsNotEmpty()
  requirement: string;

  @IsIn([...AUDIT_CHECKLIST_CRITICALITIES])
  criticality: (typeof AUDIT_CHECKLIST_CRITICALITIES)[number];

  @IsIn([...AUDIT_CHECKLIST_ANSWER_VALUES])
  answer: (typeof AUDIT_CHECKLIST_ANSWER_VALUES)[number];

  @IsString()
  @IsOptional()
  observation?: string;

  @IsBoolean()
  @IsOptional()
  allowsPhoto?: boolean;

  @IsIn([...AUDIT_CHECKLIST_PHOTO_RULES])
  @IsOptional()
  photoRequiredWhen?: (typeof AUDIT_CHECKLIST_PHOTO_RULES)[number];

  @IsString()
  @IsOptional()
  suggestedAction?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AuditChecklistEvidenceDto)
  @IsOptional()
  evidences?: AuditChecklistEvidenceDto[];
}

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
  @IsString({ each: true })
  @IsOptional()
  referencias?: string[];

  @IsString()
  @IsOptional()
  metodologia?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => AuditCharacterizationDto)
  @IsOptional()
  caracterizacao?: AuditCharacterizationDto;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  documentos_avaliados?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  resultados_conformidades?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AuditNonComplianceDto)
  @IsOptional()
  resultados_nao_conformidades?: AuditNonComplianceDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  resultados_observacoes?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  resultados_oportunidades?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AuditRiskAssessmentDto)
  @IsOptional()
  avaliacao_riscos?: AuditRiskAssessmentDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AuditActionPlanItemDto)
  @IsOptional()
  plano_acao?: AuditActionPlanItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AuditChecklistAnswerDto)
  @IsOptional()
  checklist_respostas?: AuditChecklistAnswerDto[];

  @IsString()
  @IsOptional()
  conclusao?: string;
}

export class UpdateAuditDto extends CreateAuditDto {}
