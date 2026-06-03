import { Exclude, Expose, Type, plainToInstance } from 'class-transformer';
import { SiteResponseDto } from '../../sites/dto/site-response.dto';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { Pt } from '../entities/pt.entity';

@Exclude()
class PtChecklistItemResponseDto {
  @Expose()
  id: string;

  @Expose()
  pergunta: string;

  @Expose()
  resposta?: 'Sim' | 'Não' | 'Não aplicável';

  @Expose()
  justificativa?: string;

  @Expose()
  anexo_nome?: string;
}

@Exclude()
class PtRecommendationChecklistItemResponseDto {
  @Expose()
  id: string;

  @Expose()
  pergunta: string;

  @Expose()
  resposta?: 'Ciente' | 'Não';

  @Expose()
  justificativa?: string;
}

@Exclude()
class PtRapidRiskChecklistItemResponseDto {
  @Expose()
  id: string;

  @Expose()
  pergunta: string;

  @Expose()
  secao: 'basica' | 'adicional';

  @Expose()
  resposta?: 'Sim' | 'Não';
}

@Exclude()
class PtAprSummaryResponseDto {
  @Expose()
  id: string;

  @Expose()
  numero: string;

  @Expose()
  titulo?: string | null;

  @Expose()
  status?: string | null;
}

@Exclude()
export class PtResponseDto {
  @Expose()
  id: string;

  @Expose()
  numero: string;

  @Expose()
  titulo: string;

  @Expose()
  descricao?: string | null;

  @Expose()
  data_hora_inicio: Date;

  @Expose()
  data_hora_fim: Date;

  @Expose()
  status: string;

  @Expose()
  company_id: string;

  @Expose()
  site_id: string;

  @Expose()
  apr_id?: string | null;

  @Expose()
  responsavel_id: string;

  @Expose()
  trabalho_altura: boolean;

  @Expose()
  espaco_confinado: boolean;

  @Expose()
  trabalho_quente: boolean;

  @Expose()
  eletricidade: boolean;

  @Expose()
  escavacao: boolean;

  @Expose()
  probability?: number | null;

  @Expose()
  severity?: number | null;

  @Expose()
  exposure?: number | null;

  @Expose()
  initial_risk?: number | null;

  @Expose()
  residual_risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;

  @Expose()
  evidence_photo?: string | null;

  @Expose()
  evidence_document?: string | null;

  @Expose()
  control_description?: string | null;

  @Expose()
  control_evidence: boolean;

  @Expose()
  auditado_por_id?: string | null;

  @Expose()
  data_auditoria?: Date | null;

  @Expose()
  resultado_auditoria?: string | null;

  @Expose()
  notas_auditoria?: string | null;

  @Expose()
  pdf_file_key?: string | null;

  @Expose()
  pdf_folder_path?: string | null;

  @Expose()
  pdf_original_name?: string | null;

  @Expose()
  aprovado_por_id?: string | null;

  @Expose()
  aprovado_em?: Date | null;

  @Expose()
  aprovado_motivo?: string | null;

  @Expose()
  reprovado_por_id?: string | null;

  @Expose()
  reprovado_em?: Date | null;

  @Expose()
  reprovado_motivo?: string | null;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;

  @Expose()
  @Type(() => PtChecklistItemResponseDto)
  trabalho_altura_checklist?: PtChecklistItemResponseDto[];

  @Expose()
  @Type(() => PtChecklistItemResponseDto)
  trabalho_eletrico_checklist?: PtChecklistItemResponseDto[];

  @Expose()
  @Type(() => PtChecklistItemResponseDto)
  trabalho_quente_checklist?: PtChecklistItemResponseDto[];

  @Expose()
  @Type(() => PtChecklistItemResponseDto)
  trabalho_espaco_confinado_checklist?: PtChecklistItemResponseDto[];

  @Expose()
  @Type(() => PtChecklistItemResponseDto)
  trabalho_escavacao_checklist?: PtChecklistItemResponseDto[];

  @Expose()
  @Type(() => PtRecommendationChecklistItemResponseDto)
  recomendacoes_gerais_checklist?: PtRecommendationChecklistItemResponseDto[];

  @Expose()
  @Type(() => PtRapidRiskChecklistItemResponseDto)
  analise_risco_rapida_checklist?: PtRapidRiskChecklistItemResponseDto[];

  @Expose()
  analise_risco_rapida_observacoes?: string | null;

  @Expose()
  @Type(() => SiteResponseDto)
  site?: SiteResponseDto;

  @Expose()
  @Type(() => PtAprSummaryResponseDto)
  apr?: PtAprSummaryResponseDto;

  @Expose()
  @Type(() => UserResponseDto)
  responsavel?: UserResponseDto;

  @Expose()
  @Type(() => UserResponseDto)
  auditado_por?: UserResponseDto;

  @Expose()
  @Type(() => UserResponseDto)
  executantes: UserResponseDto[];
}

export function toPtResponseDto(pt: Pt): PtResponseDto {
  return plainToInstance(PtResponseDto, pt, {
    excludeExtraneousValues: true,
  });
}
