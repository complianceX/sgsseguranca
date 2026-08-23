import {
  IsBoolean,
  IsDateString,
  IsEmpty,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizePlainTextTransform } from '../../../shared/utils/plain-text-sanitizer.util';
import { Trim } from 'class-sanitizer';

export class CreateEpiDto {
  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsNotEmpty({ message: 'Nome do EPI é obrigatório' })
  nome: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  ca?: string;

  @IsDateString()
  @IsOptional()
  validade_ca?: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  descricao?: string;

  @IsBoolean()
  @IsOptional()
  status?: boolean = true;

  @IsInt()
  @Min(0)
  @IsOptional()
  quantidade_estoque?: number | null;

  @IsOptional()
  @IsEmpty({
    message:
      'company_id não é permitido no payload. O tenant autenticado define a empresa.',
  })
  company_id?: never;
}
