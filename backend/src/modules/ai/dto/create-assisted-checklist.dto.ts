import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizePlainTextTransform } from '../../../shared/utils/plain-text-sanitizer.util';
import { Trim } from 'class-sanitizer';

export class CreateAssistedChecklistDto {
  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  titulo?: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  descricao?: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  equipamento?: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  maquina?: string;

  @IsDateString()
  @IsOptional()
  data?: string;

  @IsUUID()
  site_id: string;

  @IsUUID()
  inspetor_id: string;

  @IsBoolean()
  @IsOptional()
  is_modelo?: boolean;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  categoria?: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  periodicidade?: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  nivel_risco_padrao?: string;
}
