import { Type } from 'class-transformer';
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
  ArrayUnique,
} from 'class-validator';
import { AprRiskItemInputDto } from './apr-risk-item-input.dto';
import { AprStatus } from '../entities/apr.entity';

export class CreateAprDto {
  @IsString()
  @IsNotEmpty()
  numero: string;

  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsString()
  @IsOptional()
  descricao?: string;

  /**
   * Tipo de atividade que orienta os riscos padrão.
   * Ex.: 'trabalho_altura', 'eletrica', 'espaco_confinado', 'icamento',
   *      'caldeiraria', 'mineracao', 'manutencao_mecanica', 'outros'
   */
  @IsString()
  @IsOptional()
  tipo_atividade?: string;

  /**
   * Frente de trabalho, área, andar ou zona específica dentro do site.
   * Ex.: "Frente A – Bloco 3", "Subestação SE-04"
   */
  @IsString()
  @IsOptional()
  frente_trabalho?: string;

  /**
   * Área de risco específica dentro da frente de trabalho.
   * Ex.: "Área classificada zona 1", "Espaço confinado V-201"
   */
  @IsString()
  @IsOptional()
  area_risco?: string;

  @IsDateString()
  @IsNotEmpty()
  data_inicio: string;

  @IsDateString()
  @IsNotEmpty()
  data_fim: string;

  @IsString()
  @IsOptional()
  @IsEnum(AprStatus)
  status?: AprStatus;

  @IsBoolean()
  @IsOptional()
  is_modelo?: boolean;

  @IsBoolean()
  @IsOptional()
  is_modelo_padrao?: boolean;

  /**
   * Payload legado equivalente a `risk_items`. Aceito por compatibilidade
   * retroativa — clients novos devem enviar `risk_items`.
   * Sem @ValidateNested: o campo aceita strings/vazios que o service
   * normaliza internamente via buildAprRiskItemSnapshots.
   */
  @IsArray()
  @IsOptional()
  itens_risco?: Array<Record<string, unknown>>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AprRiskItemInputDto)
  @IsOptional()
  risk_items?: AprRiskItemInputDto[];

  /**
   * Campos legados de risco no nível da APR (pré-estrutura risk_items).
   * Mantidos por compatibilidade retroativa. Escala 1-3 alinhada à matriz
   * de risco interna (AprRiskMatrixService) e ao AprRiskItemInputDto.
   * Prefira usar risk_items para novas APRs.
   */
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(3)
  @IsOptional()
  probability?: number;

  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(3)
  @IsOptional()
  severity?: number;

  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(3)
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

  @IsUUID()
  @IsNotEmpty()
  site_id: string;

  @IsUUID()
  @IsNotEmpty()
  elaborador_id: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @IsOptional()
  activities?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @IsOptional()
  risks?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @IsOptional()
  epis?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @IsOptional()
  tools?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @IsOptional()
  machines?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @IsOptional()
  participants?: string[];

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
