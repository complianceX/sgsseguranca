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
} from 'class-validator';
import { ExpenseAdvanceMethod } from '../entities/expense-advance.entity';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateExpenseAdvanceDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  amount: number;

  @IsDateString()
  advance_date: string;

  @IsEnum(ExpenseAdvanceMethod)
  method: ExpenseAdvanceMethod;

  @Transform(trimString)
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;
}
