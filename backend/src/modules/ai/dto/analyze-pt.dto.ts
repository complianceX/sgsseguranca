import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';

export class AnalyzePtDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsNotEmpty()
  titulo: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsNotEmpty()
  descricao: string;

  @IsBoolean()
  @IsOptional()
  trabalho_altura?: boolean;

  @IsBoolean()
  @IsOptional()
  espaco_confinado?: boolean;

  @IsBoolean()
  @IsOptional()
  trabalho_quente?: boolean;

  @IsBoolean()
  @IsOptional()
  eletricidade?: boolean;
}
