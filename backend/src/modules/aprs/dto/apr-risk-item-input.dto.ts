import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AprControlHierarchy } from '../entities/apr-risk-item.entity';

type TransformArg = {
  value: unknown;
};

const emptyStringToUndefined = ({ value }: TransformArg) =>
  value === '' ? undefined : value;

const toOptionalNumber = ({ value }: TransformArg): number | undefined => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  const converted = Number(value);
  return Number.isFinite(converted) ? converted : undefined;
};

export class AprRiskItemInputDto {
  // ── Atividade e etapa ────────────────────────────────────────────────────

  /** Alias legado aceito por compatibilidade retroativa. Prefira `atividade`. */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  atividade_processo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  atividade?: string;

  /**
   * Etapa específica dentro da atividade.
   * Ex.: "Içamento do equipamento"
   */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  etapa?: string;

  // ── Identificação do perigo ──────────────────────────────────────────────

  @IsString()
  @IsOptional()
  @MaxLength(200)
  agente_ambiental?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  condicao_perigosa?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  fonte_circunstancia?: string;

  /** Alias legado aceito por compatibilidade retroativa. */
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  fontes_circunstancias?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  lesao?: string;

  /** Alias legado aceito por compatibilidade retroativa. Prefira `lesao`. */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  possiveis_lesoes?: string;

  // ── Avaliação de risco bruto ─────────────────────────────────────────────

  /**
   * Probabilidade de ocorrência. Escala 1–5 (matriz 5×5).
   * Valores 1–3 também são aceitos para compatibilidade com registros anteriores.
   */
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  probabilidade?: number;

  /**
   * Severidade / gravidade do dano. Escala 1–5 (matriz 5×5).
   * Valores 1–3 também são aceitos para compatibilidade com registros anteriores.
   */
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  severidade?: number;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  categoria_risco?: string;

  // ── Controles e hierarquia ───────────────────────────────────────────────

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  medidas_prevencao?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  epc?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  epi?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  permissao_trabalho?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  normas_relacionadas?: string;

  /**
   * Nível da medida de controle segundo hierarquia NIOSH/NOA:
   * eliminacao > substituicao > epc > administrativo > epi > combinado
   */
  @Transform(emptyStringToUndefined)
  @IsEnum(AprControlHierarchy)
  @IsOptional()
  hierarquia_controle?: AprControlHierarchy;

  // ── Risco residual ───────────────────────────────────────────────────────

  /** Probabilidade reavaliada após aplicação das medidas de controle. Escala 1–5. */
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  residual_probabilidade?: number;

  /** Severidade reavaliada após aplicação das medidas de controle. Escala 1–5. */
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  residual_severidade?: number;

  // ── Plano de ação ────────────────────────────────────────────────────────

  @IsString()
  @IsOptional()
  @MaxLength(200)
  responsavel?: string;

  @Transform(emptyStringToUndefined)
  @IsDateString()
  @IsOptional()
  prazo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  status_acao?: string;
}
