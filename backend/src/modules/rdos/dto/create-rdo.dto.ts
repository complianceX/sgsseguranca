import {
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEmpty,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class MaoDeObraItemDto {
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  funcao: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantidade: number;

  @IsIn(['manha', 'tarde', 'noite'])
  turno: 'manha' | 'tarde' | 'noite';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  horas: number;
}

export class EquipamentoItemDto {
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantidade: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  horas_trabalhadas: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  horas_ociosas: number;

  @Transform(trimString)
  @IsString()
  @IsOptional()
  @MaxLength(500)
  observacao?: string;
}

export class MaterialItemDto {
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  descricao: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unidade: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantidade: number;

  @Transform(trimString)
  @IsString()
  @IsOptional()
  @MaxLength(160)
  fornecedor?: string;
}

export class ServicoItemDto {
  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  descricao: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentual_concluido: number;

  @Transform(trimString)
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  observacao?: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  @IsOptional()
  fotos?: string[];
}

export class OcorrenciaItemDto {
  @IsIn(['acidente', 'incidente', 'visita', 'paralisacao', 'outro'])
  tipo: 'acidente' | 'incidente' | 'visita' | 'paralisacao' | 'outro';

  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  descricao: string;

  @Transform(trimString)
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'hora deve estar no formato HH:mm',
  })
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

  @IsOptional()
  @IsEmpty({
    message:
      'company_id não é permitido no payload. O tenant autenticado define a empresa.',
  })
  company_id?: never;

  // Condições climáticas
  @IsIn(['ensolarado', 'nublado', 'chuvoso', 'parcialmente_nublado'])
  @IsOptional()
  clima_manha?: string;

  @IsIn(['ensolarado', 'nublado', 'chuvoso', 'parcialmente_nublado'])
  @IsOptional()
  clima_tarde?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  temperatura_min?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  temperatura_max?: number;

  @Transform(trimString)
  @IsString()
  @IsOptional()
  @MaxLength(160)
  condicao_terreno?: string;

  // Seções JSONB
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MaoDeObraItemDto)
  @IsOptional()
  mao_de_obra?: MaoDeObraItemDto[];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => EquipamentoItemDto)
  @IsOptional()
  equipamentos?: EquipamentoItemDto[];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MaterialItemDto)
  @IsOptional()
  materiais_recebidos?: MaterialItemDto[];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ServicoItemDto)
  @IsOptional()
  servicos_executados?: ServicoItemDto[];

  @IsArray()
  @ArrayMaxSize(100)
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

  @Transform(trimString)
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  motivo_paralisacao?: string;

  // Texto livre
  @Transform(trimString)
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  observacoes?: string;

  @Transform(trimString)
  @IsString()
  @IsOptional()
  @MaxLength(3000)
  programa_servicos_amanha?: string;
}
