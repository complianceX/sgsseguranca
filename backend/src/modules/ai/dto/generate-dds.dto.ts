import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';

export class GenerateDdsDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  tema?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
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
