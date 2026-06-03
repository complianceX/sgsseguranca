import { Transform } from 'class-transformer';
import { sanitizePlainTextTransform } from '../../../shared/utils/plain-text-sanitizer.util';
import { Trim } from 'class-sanitizer';
import { IsArray, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAssistedNonConformityDto {
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
  @IsOptional()
  site_id?: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  local_setor_area?: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  responsavel_area?: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
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
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  source_context?: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
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
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  image_notes?: string;
}
