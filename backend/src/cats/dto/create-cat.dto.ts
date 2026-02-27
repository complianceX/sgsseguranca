import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateCatDto {
  @IsOptional()
  @IsString()
  numero?: string;

  @IsDateString()
  @IsNotEmpty()
  data_ocorrencia: string;

  @IsEnum(['tipico', 'trajeto', 'doenca_ocupacional', 'outros'])
  @IsOptional()
  tipo?: 'tipico' | 'trajeto' | 'doenca_ocupacional' | 'outros';

  @IsEnum(['leve', 'moderada', 'grave', 'fatal'])
  @IsOptional()
  gravidade?: 'leve' | 'moderada' | 'grave' | 'fatal';

  @IsString()
  @IsNotEmpty()
  descricao: string;

  @IsOptional()
  @IsString()
  local_ocorrencia?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pessoas_envolvidas?: string[];

  @IsOptional()
  @IsString()
  acao_imediata?: string;

  @IsOptional()
  @IsUUID()
  site_id?: string;

  @IsOptional()
  @IsUUID()
  worker_id?: string;
}
