import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateEpiAssignmentDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  quantidade?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}
