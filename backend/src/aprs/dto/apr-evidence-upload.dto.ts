import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const toOptionalFloat = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const trimOptionalString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AprEvidenceUploadDto {
  @IsOptional()
  @Transform(trimOptionalString)
  @IsISO8601()
  captured_at?: string;

  @IsOptional()
  @Transform(toOptionalFloat)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Transform(toOptionalFloat)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @Transform(toOptionalFloat)
  @IsNumber()
  @Min(0)
  @Max(10000)
  accuracy_m?: number;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsString()
  @MaxLength(120)
  device_id?: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsISO8601()
  exif_datetime?: string;
}
