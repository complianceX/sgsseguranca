import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SophieAnalyzeDto {
  @IsString()
  @IsOptional()
  atividade?: string;

  @IsString()
  @IsOptional()
  setor?: string;

  @IsString()
  @IsOptional()
  maquina?: string;

  @IsString()
  @IsOptional()
  processo?: string;

  @IsString()
  @IsOptional()
  material?: string;

  @IsString()
  @IsOptional()
  ambiente?: string;

  // Se informado, Sophie calcula a matriz (probabilidade x severidade).
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  probabilidade?: number;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  severidade?: number;
}

