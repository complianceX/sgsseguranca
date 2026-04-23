import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const toOptionalInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const trimOptionalString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class DashboardDocumentPendenciesQueryDto {
  @IsOptional()
  @Transform(trimOptionalString)
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsString()
  @MaxLength(40)
  module?: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsIn(['critical', 'high', 'medium', 'low'])
  priority?: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsIn(['critical', 'high', 'medium', 'low'])
  criticality?: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsString()
  @MaxLength(60)
  status?: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  @Max(10000)
  page?: number;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
