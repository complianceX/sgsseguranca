import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ExpenseReportStatus } from '../entities/expense-report.entity';

export class FindExpenseReportsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsUUID()
  site_id?: string;

  @IsOptional()
  @IsEnum(ExpenseReportStatus)
  status?: ExpenseReportStatus;

  @IsOptional()
  @IsDateString()
  period_start?: string;

  @IsOptional()
  @IsDateString()
  period_end?: string;
}
