import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GenerateSophieReportDto {
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(12)
  mes?: number;

  @IsInt()
  @IsOptional()
  @Min(2000)
  ano?: number;
}
