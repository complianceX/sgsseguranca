import {
  Equals,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizePlainTextTransform } from '../../../shared/utils/plain-text-sanitizer.util';
import { Trim } from 'class-sanitizer';
import { IsCNPJ } from '../../../shared/validators/cnpj.validator';
import { IsCPF } from '../../../shared/validators/cpf.validator';

export class CompleteOnboardingDto {
  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsNotEmpty({ message: 'Razão social é obrigatória' })
  @MaxLength(255)
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

  @IsEmail({}, { message: 'E-mail institucional inválido' })
  @Trim()
  email_contato: string;

  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  @IsNotEmpty({ message: 'Nome do administrador é obrigatório' })
  admin_nome: string;

  @IsString()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsCPF({ message: 'CPF do administrador inválido' })
  admin_cpf: string;

  @IsEmail({}, { message: 'E-mail do administrador inválido' })
  @Trim()
  admin_email: string;

  @IsString()
  @MinLength(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
  admin_password: string;

  @Equals(true, { message: 'Aceite os termos para continuar' })
  termsAccepted: true;
}
