import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdatePhotographicReportDayDto {
  @IsOptional()
  @IsDateString()
  activity_date?: string;

  @IsOptional()
  @IsString()
  day_summary?: string;
}
