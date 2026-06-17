import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class ExtendTrialDto {
  @ApiProperty({
    description: 'Dias adicionais de trial a adicionar (1–90)',
    example: 14,
    minimum: 1,
    maximum: 90,
  })
  @IsInt()
  @Min(1)
  @Max(90)
  extraDays: number;
}
