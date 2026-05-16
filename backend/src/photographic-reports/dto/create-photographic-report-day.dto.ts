import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreatePhotographicReportDayDto {
  @IsDateString()
  activity_date: string;

  @IsOptional()
  @IsString()
  day_summary?: string;
}
