import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class UpdatePhotographicReportImageDto {
  @IsOptional()
  @IsUUID()
  report_day_id?: string | null;

  @IsOptional()
  @IsString()
  manual_caption?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  image_order?: number;

  @IsOptional()
  @IsString()
  ai_title?: string | null;

  @IsOptional()
  @IsString()
  ai_description?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(8)
  ai_positive_points?: string[] | null;

  @IsOptional()
  @IsString()
  ai_technical_assessment?: string | null;

  @IsOptional()
  @IsString()
  ai_condition_classification?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  ai_recommendations?: string[] | null;
}
