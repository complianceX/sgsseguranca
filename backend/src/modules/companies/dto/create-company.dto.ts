import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizePlainTextTransform } from '../../../shared/utils/plain-text-sanitizer.util';
import { Trim } from 'class-sanitizer';
import { IsCNPJ } from '../../../shared/validators/cnpj.validator';

export class CreateCompanyDto {
  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsNotEmpty({ message: 'Razão social é obrigatória' })
  razao_social: string;

  @IsString()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsCNPJ({ message: 'CNPJ inválido' })
  cnpj: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsNotEmpty({ message: 'Endereço é obrigatório' })
  endereco: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsNotEmpty({ message: 'Responsável é obrigatório' })
  responsavel: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail de contato inválido' })
  @Trim()
  email_contato?: string | null;

  @IsOptional()
  @Matches(/^data:image\/(png|jpeg|webp);base64,/, {
    message:
      'Logo deve ser PNG, JPEG ou WebP em formato data URL (data:image/...;base64,...).',
  })
  logo_url?: string | null;

  @IsBoolean()
  @IsOptional()
  status?: boolean = true;
}
