import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAssistedPtDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  title?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  description?: string;

  @IsUUID()
  site_id: string;

  @IsUUID()
  @IsOptional()
  company_id?: string;

  @IsUUID()
  responsavel_id: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  site_name?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
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
