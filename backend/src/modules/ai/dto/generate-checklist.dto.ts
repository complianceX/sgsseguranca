import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';

export class GenerateChecklistDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  titulo?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  descricao?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  equipamento?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
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
