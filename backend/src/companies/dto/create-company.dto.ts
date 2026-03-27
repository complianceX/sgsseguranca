import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';
import { IsCNPJ } from '../../common/validators/cnpj.validator';

export class CreateCompanyDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
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
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsNotEmpty({ message: 'Endereço é obrigatório' })
  endereco: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsNotEmpty({ message: 'Responsável é obrigatório' })
  responsavel: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail de contato inválido' })
  @Trim()
  email_contato?: string | null;

  @IsString()
  @IsOptional()
  logo_url?: string;

  @IsBoolean()
  @IsOptional()
  status?: boolean = true;
}
