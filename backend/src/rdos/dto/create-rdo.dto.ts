import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MaoDeObraItemDto {
  @IsString()
  funcao: string;

  @IsNumber()
  @Min(0)
  quantidade: number;

  @IsIn(['manha', 'tarde', 'noite'])
  turno: 'manha' | 'tarde' | 'noite';

  @IsNumber()
  @Min(0)
  horas: number;
}

export class EquipamentoItemDto {
  @IsString()
  nome: string;

  @IsNumber()
  @Min(0)
  quantidade: number;

  @IsNumber()
  @Min(0)
  horas_trabalhadas: number;

  @IsNumber()
  @Min(0)
  horas_ociosas: number;

  @IsString()
  @IsOptional()
  observacao?: string;
}

export class MaterialItemDto {
  @IsString()
  descricao: string;

  @IsString()
  unidade: string;

  @IsNumber()
  @Min(0)
  quantidade: number;

  @IsString()
  @IsOptional()
  fornecedor?: string;
}

export class ServicoItemDto {
  @IsString()
  descricao: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  percentual_concluido: number;

  @IsString()
  @IsOptional()
  observacao?: string;
}

export class OcorrenciaItemDto {
  @IsIn(['acidente', 'incidente', 'visita', 'paralisacao', 'outro'])
  tipo: 'acidente' | 'incidente' | 'visita' | 'paralisacao' | 'outro';

  @IsString()
  descricao: string;

  @IsString()
  @IsOptional()
  hora?: string;
}

export class CreateRdoDto {
  @IsDateString()
  data: string;

  @IsIn(['rascunho', 'enviado', 'aprovado'])
  @IsOptional()
  status?: string;

  @IsUUID()
  @IsOptional()
  site_id?: string;

  @IsUUID()
  @IsOptional()
  responsavel_id?: string;

  @IsUUID()
  @IsOptional()
  company_id?: string;

  // Condições climáticas
  @IsIn(['ensolarado', 'nublado', 'chuvoso', 'parcialmente_nublado'])
  @IsOptional()
  clima_manha?: string;

  @IsIn(['ensolarado', 'nublado', 'chuvoso', 'parcialmente_nublado'])
  @IsOptional()
  clima_tarde?: string;

  @IsNumber()
  @IsOptional()
  temperatura_min?: number;

  @IsNumber()
  @IsOptional()
  temperatura_max?: number;

  @IsString()
  @IsOptional()
  condicao_terreno?: string;

  // Seções JSONB
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaoDeObraItemDto)
  @IsOptional()
  mao_de_obra?: MaoDeObraItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EquipamentoItemDto)
  @IsOptional()
  equipamentos?: EquipamentoItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialItemDto)
  @IsOptional()
  materiais_recebidos?: MaterialItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServicoItemDto)
  @IsOptional()
  servicos_executados?: ServicoItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OcorrenciaItemDto)
  @IsOptional()
  ocorrencias?: OcorrenciaItemDto[];

  // Flags
  @IsBoolean()
  @IsOptional()
  houve_acidente?: boolean;

  @IsBoolean()
  @IsOptional()
  houve_paralisacao?: boolean;

  @IsString()
  @IsOptional()
  motivo_paralisacao?: string;

  // Texto livre
  @IsString()
  @IsOptional()
  observacoes?: string;

  @IsString()
  @IsOptional()
  programa_servicos_amanha?: string;
}
