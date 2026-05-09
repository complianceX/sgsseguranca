import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateExpenseReportDto {
  @IsDateString()
  period_start: string;

  @IsDateString()
  period_end: string;

  @IsUUID()
  site_id: string;

  @IsUUID()
  responsible_id: string;

  @Transform(trimString)
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsEmpty({
    message:
      'company_id não é permitido no payload. O tenant autenticado define a empresa.',
  })
  company_id?: never;
}
