import { Transform, Type } from 'class-transformer';
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

function trimSearchValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

export class FindRdosQueryDto {
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

  @Transform(({ value }) => trimSearchValue(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['rascunho', 'enviado', 'aprovado', 'cancelado'])
  status?: 'rascunho' | 'enviado' | 'aprovado' | 'cancelado';

  @IsOptional()
  @IsDateString()
  data_inicio?: string;

  @IsOptional()
  @IsDateString()
  data_fim?: string;
}
