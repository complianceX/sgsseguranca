import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';

export class CreateAssistedChecklistDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  titulo?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  descricao?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  equipamento?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
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
  @IsOptional()
  categoria?: string;

  @IsString()
  @IsOptional()
  periodicidade?: string;

  @IsString()
  @IsOptional()
  nivel_risco_padrao?: string;
}
