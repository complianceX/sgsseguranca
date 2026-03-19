import { Exclude, Expose, Type, plainToInstance } from 'class-transformer';
import { CompanyResponseDto } from '../../companies/dto/company-response.dto';
import { SiteResponseDto } from '../../sites/dto/site-response.dto';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { Apr } from '../entities/apr.entity';

@Exclude()
class AprActivityResponseDto {
  @Expose()
  id: string;

  @Expose()
  nome: string;

  @Expose()
  descricao?: string | null;

  @Expose()
  status: boolean;

  @Expose()
  company_id: string;
}

@Exclude()
class AprRiskResponseDto {
  @Expose()
  id: string;

  @Expose()
  nome: string;

  @Expose()
  categoria: string;

  @Expose()
  descricao?: string | null;

  @Expose()
  medidas_controle?: string | null;

  @Expose()
  status: boolean;

  @Expose()
  company_id: string;
}

@Exclude()
class AprEpiResponseDto {
  @Expose()
  id: string;

  @Expose()
  nome: string;

  @Expose()
  ca?: string | null;

  @Expose()
  validade_ca?: Date | null;

  @Expose()
  descricao?: string | null;

  @Expose()
  status: boolean;

  @Expose()
  company_id: string;
}

@Exclude()
class AprToolResponseDto {
  @Expose()
  id: string;

  @Expose()
  nome: string;

  @Expose()
  numero_serie?: string | null;

  @Expose()
  descricao?: string | null;

  @Expose()
  status: boolean;

  @Expose()
  company_id: string;
}

@Exclude()
class AprMachineResponseDto {
  @Expose()
  id: string;

  @Expose()
  nome: string;

  @Expose()
  placa?: string | null;

  @Expose()
  horimetro_atual?: number;

  @Expose()
  descricao?: string | null;

  @Expose()
  requisitos_seguranca?: string | null;

  @Expose()
  status: boolean;

  @Expose()
  company_id: string;
}

@Exclude()
class AprRiskItemResponseDto {
  @Expose()
  id: string;

  @Expose()
  apr_id: string;

  @Expose()
  atividade?: string | null;

  @Expose()
  agente_ambiental?: string | null;

  @Expose()
  condicao_perigosa?: string | null;

  @Expose()
  fonte_circunstancia?: string | null;

  @Expose()
  lesao?: string | null;

  @Expose()
  probabilidade?: number | null;

  @Expose()
  severidade?: number | null;

  @Expose()
  score_risco?: number | null;

  @Expose()
  categoria_risco?: string | null;

  @Expose()
  prioridade?: string | null;

  @Expose()
  medidas_prevencao?: string | null;

  @Expose()
  ordem: number;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}

@Exclude()
class AprClassificationResumoResponseDto {
  @Expose()
  total: number;

  @Expose()
  aceitavel: number;

  @Expose()
  atencao: number;

  @Expose()
  substancial: number;

  @Expose()
  critico: number;
}

@Exclude()
export class AprResponseDto {
  @Expose()
  id: string;

  @Expose()
  numero: string;

  @Expose()
  titulo: string;

  @Expose()
  descricao?: string | null;

  @Expose()
  data_inicio: Date;

  @Expose()
  data_fim: Date;

  @Expose()
  status: string;

  @Expose()
  is_modelo: boolean;

  @Expose()
  is_modelo_padrao: boolean;

  @Expose()
  itens_risco?: Array<Record<string, string>>;

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
  company_id: string;

  @Expose()
  site_id: string;

  @Expose()
  elaborador_id: string;

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
  versao: number;

  @Expose()
  parent_apr_id?: string | null;

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
  @Type(() => AprClassificationResumoResponseDto)
  classificacao_resumo?: AprClassificationResumoResponseDto;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;

  @Expose()
  @Type(() => CompanyResponseDto)
  company?: CompanyResponseDto;

  @Expose()
  @Type(() => SiteResponseDto)
  site?: SiteResponseDto;

  @Expose()
  @Type(() => UserResponseDto)
  elaborador?: UserResponseDto;

  @Expose()
  @Type(() => UserResponseDto)
  auditado_por?: UserResponseDto;

  @Expose()
  @Type(() => UserResponseDto)
  participants: UserResponseDto[];

  @Expose()
  @Type(() => AprActivityResponseDto)
  activities: AprActivityResponseDto[];

  @Expose()
  @Type(() => AprRiskResponseDto)
  risks: AprRiskResponseDto[];

  @Expose()
  @Type(() => AprEpiResponseDto)
  epis: AprEpiResponseDto[];

  @Expose()
  @Type(() => AprToolResponseDto)
  tools: AprToolResponseDto[];

  @Expose()
  @Type(() => AprMachineResponseDto)
  machines: AprMachineResponseDto[];

  @Expose()
  @Type(() => AprRiskItemResponseDto)
  risk_items: AprRiskItemResponseDto[];
}

export function toAprResponseDto(apr: Apr): AprResponseDto {
  return plainToInstance(AprResponseDto, apr, {
    excludeExtraneousValues: true,
  });
}
