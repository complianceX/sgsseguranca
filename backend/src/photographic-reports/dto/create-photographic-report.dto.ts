import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import {
  PhotographicReportAreaStatus,
  PhotographicReportShift,
  PhotographicReportTone,
} from '../entities/photographic-report.entity';

export class CreatePhotographicReportDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  client_id?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  project_id?: string;

  @IsString()
  @Length(2, 160)
  client_name: string;

  @IsString()
  @Length(2, 160)
  project_name: string;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  unit_name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 220)
  location?: string;

  @IsString()
  @Length(2, 120)
  activity_type: string;

  @IsOptional()
  @IsEnum(PhotographicReportTone)
  report_tone?: PhotographicReportTone;

  @IsOptional()
  @IsEnum(PhotographicReportAreaStatus)
  area_status?: PhotographicReportAreaStatus;

  @IsOptional()
  @IsEnum(PhotographicReportShift)
  shift?: PhotographicReportShift;

  @IsDateString()
  start_date: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsString()
  @Length(4, 5)
  start_time: string;

  @IsString()
  @Length(4, 5)
  end_time: string;

  @IsString()
  @Length(2, 160)
  responsible_name: string;

  @IsString()
  @Length(2, 180)
  contractor_company: string;

  @IsOptional()
  @IsString()
  general_observations?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  created_by?: string;
}
