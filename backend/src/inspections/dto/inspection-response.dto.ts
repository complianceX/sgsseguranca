import { Exclude, Expose, Type } from 'class-transformer';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { SiteResponseDto } from '../../sites/dto/site-response.dto';

@Exclude()
class InspectionCompanyResponseDto {
  @Expose()
  id: string;

  @Expose()
  razao_social: string;
}

@Exclude()
class InspectionPerigoRiscoResponseDto {
  @Expose()
  grupo_risco: string;

  @Expose()
  perigo_fator_risco: string;

  @Expose()
  fonte_circunstancia: string;

  @Expose()
  trabalhadores_expostos: string;

  @Expose()
  tipo_exposicao: string;

  @Expose()
  medidas_existentes: string;

  @Expose()
  severidade: string;

  @Expose()
  probabilidade: string;

  @Expose()
  nivel_risco: string;

  @Expose()
  classificacao_risco: string;

  @Expose()
  acoes_necessarias: string;

  @Expose()
  prazo: string;

  @Expose()
  responsavel: string;
}

@Exclude()
class InspectionPlanoAcaoResponseDto {
  @Expose()
  acao: string;

  @Expose()
  responsavel: string;

  @Expose()
  prazo: string;

  @Expose()
  status: string;
}

@Exclude()
class InspectionEvidenceResponseDto {
  @Expose()
  descricao: string;

  @Expose()
  url?: string;

  @Expose()
  original_name?: string;
}

@Exclude()
export class InspectionResponseDto {
  @Expose()
  id: string;

  @Expose()
  company_id: string;

  @Expose()
  site_id: string;

  @Expose()
  setor_area: string;

  @Expose()
  tipo_inspecao: string;

  @Expose()
  data_inspecao: Date;

  @Expose()
  horario: string;

  @Expose()
  responsavel_id: string;

  @Expose()
  objetivo: string;

  @Expose()
  descricao_local_atividades: string;

  @Expose()
  metodologia: string[];

  @Expose()
  @Type(() => InspectionPerigoRiscoResponseDto)
  perigos_riscos: InspectionPerigoRiscoResponseDto[];

  @Expose()
  @Type(() => InspectionPlanoAcaoResponseDto)
  plano_acao: InspectionPlanoAcaoResponseDto[];

  @Expose()
  @Type(() => InspectionEvidenceResponseDto)
  evidencias: InspectionEvidenceResponseDto[];

  @Expose()
  conclusao: string;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;

  @Expose()
  @Type(() => UserResponseDto)
  responsavel: UserResponseDto;

  @Expose()
  @Type(() => SiteResponseDto)
  site: SiteResponseDto;

  @Expose()
  @Type(() => InspectionCompanyResponseDto)
  company?: InspectionCompanyResponseDto;
}
