import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizePlainTextTransform } from '../../../shared/utils/plain-text-sanitizer.util';
import { Trim } from 'class-sanitizer';

export class GenerateDdsDto {
  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  tema?: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  contexto?: string;
}

export class CreateAssistedDdsDto extends GenerateDdsDto {
  @IsDateString()
  @IsOptional()
  data?: string;

  @IsBoolean()
  @IsOptional()
  is_modelo?: boolean;

  @IsUUID()
  site_id: string;

  @IsUUID()
  facilitador_id: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  participants?: string[];
}
