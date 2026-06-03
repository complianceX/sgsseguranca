import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class UploadPhotographicReportImagesDto {
  @IsOptional()
  @IsUUID()
  report_day_id?: string | null;

  @IsOptional()
  @IsDateString()
  activity_date?: string;

  @IsOptional()
  @IsString()
  manual_caption?: string | null;
}
