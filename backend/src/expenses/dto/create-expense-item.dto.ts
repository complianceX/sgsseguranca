import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ExpenseCategory } from '../entities/expense-item.entity';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateExpenseItemDto {
  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  amount: number;

  @IsDateString()
  expense_date: string;

  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  description: string;

  @Transform(trimString)
  @IsString()
  @IsOptional()
  @MaxLength(160)
  vendor?: string;

  @Transform(trimString)
  @IsString()
  @IsOptional()
  @MaxLength(160)
  location?: string;
}
