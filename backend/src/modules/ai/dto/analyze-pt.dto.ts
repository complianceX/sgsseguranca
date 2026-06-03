import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizePlainTextTransform } from '../../../shared/utils/plain-text-sanitizer.util';
import { Trim } from 'class-sanitizer';

export class AnalyzePtDto {
  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsNotEmpty()
  titulo: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
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
