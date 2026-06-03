import {
  IsEmpty,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizePlainTextTransform } from '../../../shared/utils/plain-text-sanitizer.util';
import { Trim } from 'class-sanitizer';

export class CreateActivityDto {
  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsNotEmpty({ message: 'Nome da atividade é obrigatório' })
  nome: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsOptional()
  descricao?: string;

  @IsBoolean()
  @IsOptional()
  status?: boolean = true;

  @IsOptional()
  @IsEmpty({
    message:
      'company_id não é permitido no payload. O tenant autenticado define a empresa.',
  })
  company_id?: never;
}
