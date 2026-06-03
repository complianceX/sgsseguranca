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

export class GenerateChecklistDto {
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
  @IsOptional()
  site_id: string;

  @IsUUID()
  @IsOptional()
  inspetor_id: string;

  @IsBoolean()
  @IsOptional()
  is_modelo?: boolean;
}
