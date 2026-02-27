import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsUUID,
  IsBoolean,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';
import { IsCPF } from '../../common/validators/cpf.validator';
import { ValidationMessages } from '../../common/validation/validation-messages';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'Nome completo do usuário',
    example: 'João da Silva',
    minLength: 3,
    maxLength: 100,
  })
  @IsString({ message: ValidationMessages.IS_STRING('Nome') })
  @Trim()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsNotEmpty({ message: ValidationMessages.IS_NOT_EMPTY('Nome') })
  @MinLength(3, { message: ValidationMessages.MIN_LENGTH('Nome', 3) })
  @MaxLength(100, { message: ValidationMessages.MAX_LENGTH('Nome', 100) })
  nome: string;

  @ApiProperty({
    description: 'CPF do usuário (apenas números)',
    example: '12345678900',
    pattern: '^\\d{11}$',
  })
  @IsString({ message: ValidationMessages.IS_STRING('CPF') })
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsCPF({ message: 'CPF inválido' })
  cpf: string;

  @ApiProperty({
    description: 'Email do usuário',
    example: 'joao@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: ValidationMessages.IS_EMAIL('Email') })
  @IsNotEmpty({ message: ValidationMessages.IS_NOT_EMPTY('Email') })
  @MaxLength(100, { message: ValidationMessages.MAX_LENGTH('Email', 100) })
  email: string;

  @ApiPropertyOptional({
    description: 'Senha (mínimo 6 caracteres)',
    example: 'senha123',
    minLength: 6,
  })
  @IsString({ message: ValidationMessages.IS_STRING('Senha') })
  @IsOptional()
  @MinLength(6, { message: ValidationMessages.MIN_LENGTH('Senha', 6) })
  password?: string;

  @ApiPropertyOptional({
    description: 'Função/cargo do usuário',
    example: 'Engenheiro de Segurança',
    maxLength: 100,
  })
  @IsString({ message: ValidationMessages.IS_STRING('Função') })
  @IsOptional()
  @MaxLength(100, { message: ValidationMessages.MAX_LENGTH('Função', 100) })
  funcao?: string;

  @ApiPropertyOptional({
    description: 'ID da empresa do usuário',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID('4', { message: ValidationMessages.IS_UUID('ID da Empresa') })
  @IsOptional()
  company_id?: string;

  @ApiProperty({
    description: 'ID do perfil do usuário',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID('4', { message: ValidationMessages.IS_UUID('ID do Perfil') })
  @IsNotEmpty({ message: ValidationMessages.IS_NOT_EMPTY('Perfil') })
  profile_id: string;

  @ApiPropertyOptional({
    description: 'ID da obra/local do usuário',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID('4', { message: ValidationMessages.IS_UUID('ID da Obra') })
  @IsOptional()
  site_id?: string;

  @ApiPropertyOptional({
    description: 'Status do usuário (ativo/inativo)',
    example: true,
    default: true,
  })
  @IsBoolean({ message: ValidationMessages.IS_BOOLEAN('Status') })
  @IsOptional()
  status?: boolean = true;
}
