import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsUUID,
  IsArray,
  IsEnum,
  IsBoolean,
} from 'class-validator';

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

  @IsDateString()
  @IsNotEmpty()
  data_inicio: string;

  @IsDateString()
  @IsNotEmpty()
  data_fim: string;

  @IsString()
  @IsOptional()
  @IsEnum(['Pendente', 'Aprovada', 'Cancelada', 'Encerrada'])
  status?: string;

  @IsBoolean()
  @IsOptional()
  is_modelo?: boolean;

  @IsBoolean()
  @IsOptional()
  is_modelo_padrao?: boolean;

  @IsArray()
  @IsOptional()
  itens_risco?: Array<Record<string, string>>;

  @IsUUID()
  @IsNotEmpty()
  site_id: string;

  @IsUUID()
  @IsNotEmpty()
  elaborador_id: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  activities?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  risks?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  epis?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  tools?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  machines?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
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
