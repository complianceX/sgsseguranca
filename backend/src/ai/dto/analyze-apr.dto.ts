import { IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';

export class AnalyzeAprDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsNotEmpty({ message: 'Descrição é obrigatória' })
  description: string;
}
