import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';
import { IsArray, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAssistedNonConformityDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  title?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  site_id?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  local_setor_area?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  responsavel_area?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  tipo?: string;

  @IsString()
  @IsOptional()
  @IsIn(['manual', 'image', 'checklist', 'inspection'])
  source_type?: 'manual' | 'image' | 'checklist' | 'inspection';

  @IsUUID()
  @IsOptional()
  source_reference?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  source_context?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  image_analysis_summary?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  image_risks?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  image_actions?: string[];

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  image_notes?: string;
}
