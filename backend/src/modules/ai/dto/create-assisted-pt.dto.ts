import { Transform } from 'class-transformer';
import { sanitizePlainTextTransform } from '../../../shared/utils/plain-text-sanitizer.util';
import { Trim } from 'class-sanitizer';
import {
  IsBoolean,
  IsEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateAssistedPtDto {
  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  title?: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  description?: string;

  @IsUUID()
  site_id: string;

  @IsOptional()
  @IsEmpty({
    message:
      'company_id não é permitido no payload. O tenant autenticado define a empresa.',
  })
  company_id?: never;

  @IsUUID()
  responsavel_id: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  site_name?: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  company_name?: string;

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

  @IsBoolean()
  @IsOptional()
  escavacao?: boolean;
}
