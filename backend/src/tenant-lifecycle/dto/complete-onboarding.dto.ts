import {
  Equals,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';
import { IsCNPJ } from '../../common/validators/cnpj.validator';
import { IsCPF } from '../../common/validators/cpf.validator';

const stripScript = (value: string) =>
  typeof value === 'string'
    ? value.replace(/<script[^>]{0,200}>/gi, '')
    : value;

export class CompleteOnboardingDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: string }) => stripScript(value))
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
  @Transform(({ value }: { value: string }) => stripScript(value))
  @IsNotEmpty({ message: 'Endereço é obrigatório' })
  endereco: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: string }) => stripScript(value))
  @IsNotEmpty({ message: 'Responsável é obrigatório' })
  responsavel: string;

  @IsEmail({}, { message: 'E-mail institucional inválido' })
  @Trim()
  email_contato: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: string }) => stripScript(value))
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
