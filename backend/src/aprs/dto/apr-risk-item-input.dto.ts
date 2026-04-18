import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AprControlHierarchy } from '../entities/apr-risk-item.entity';

export class AprRiskItemInputDto {
  // ── Atividade e etapa ────────────────────────────────────────────────────

  /** Alias legado aceito por compatibilidade retroativa. Prefira `atividade`. */
  @IsString()
  @IsOptional()
  atividade_processo?: string;

  @IsString()
  @IsOptional()
  atividade?: string;

  /**
   * Etapa específica dentro da atividade.
   * Ex.: "Içamento do equipamento"
   */
  @IsString()
  @IsOptional()
  etapa?: string;

  // ── Identificação do perigo ──────────────────────────────────────────────

  @IsString()
  @IsOptional()
  agente_ambiental?: string;

  @IsString()
  @IsOptional()
  condicao_perigosa?: string;

  @IsString()
  @IsOptional()
  fonte_circunstancia?: string;

  /** Alias legado aceito por compatibilidade retroativa. */
  @IsString()
  @IsOptional()
  fontes_circunstancias?: string;

  @IsString()
  @IsOptional()
  lesao?: string;

  /** Alias legado aceito por compatibilidade retroativa. Prefira `lesao`. */
  @IsString()
  @IsOptional()
  possiveis_lesoes?: string;

  // ── Avaliação de risco bruto ─────────────────────────────────────────────

  /**
   * Probabilidade de ocorrência. Escala 1–5 (matriz 5×5).
   * Valores 1–3 também são aceitos para compatibilidade com registros anteriores.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  probabilidade?: number;

  /**
   * Severidade / gravidade do dano. Escala 1–5 (matriz 5×5).
   * Valores 1–3 também são aceitos para compatibilidade com registros anteriores.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  severidade?: number;

  @IsString()
  @IsOptional()
  categoria_risco?: string;

  // ── Controles e hierarquia ───────────────────────────────────────────────

  @IsString()
  @IsOptional()
  medidas_prevencao?: string;

  @IsString()
  @IsOptional()
  epc?: string;

  @IsString()
  @IsOptional()
  epi?: string;

  @IsString()
  @IsOptional()
  permissao_trabalho?: string;

  @IsString()
  @IsOptional()
  normas_relacionadas?: string;

  /**
   * Nível da medida de controle segundo hierarquia NIOSH/NOA:
   * eliminacao > substituicao > epc > administrativo > epi > combinado
   */
  @IsEnum(AprControlHierarchy)
  @IsOptional()
  hierarquia_controle?: AprControlHierarchy;

  // ── Risco residual ───────────────────────────────────────────────────────

  /** Probabilidade reavaliada após aplicação das medidas de controle. Escala 1–5. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  residual_probabilidade?: number;

  /** Severidade reavaliada após aplicação das medidas de controle. Escala 1–5. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  residual_severidade?: number;

  // ── Plano de ação ────────────────────────────────────────────────────────

  @IsString()
  @IsOptional()
  responsavel?: string;

  @IsDateString()
  @IsOptional()
  prazo?: string;

  @IsString()
  @IsOptional()
  status_acao?: string;
}
