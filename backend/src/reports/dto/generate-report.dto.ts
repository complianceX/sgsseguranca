import { IsInt, IsNotEmpty, Max, Min } from 'class-validator';

export class GenerateReportDto {
  @IsInt()
  @IsNotEmpty({ message: 'Mês é obrigatório' })
  @Min(1)
  @Max(12)
  mes: number;

  @IsInt()
  @IsNotEmpty({ message: 'Ano é obrigatório' })
  @Min(2000)
  ano: number;
}
