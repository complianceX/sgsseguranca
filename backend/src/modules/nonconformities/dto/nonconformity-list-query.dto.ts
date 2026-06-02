import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
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

const toOptionalTrimmedString = ({
  value,
}: {
  value: unknown;
}): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export class NonConformityListQueryDto {
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(toOptionalTrimmedString)
  @IsString()
  @MaxLength(120)
  search?: string;
}
