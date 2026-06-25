import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';
import { IsCNPJ } from '../../../shared/validators/cnpj.validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({
    description: 'Razão social da empresa',
    example: 'Metalúrgica A&B Ltda',
  })
  @IsString()
  @Trim()
  @IsNotEmpty({ message: 'Razão social é obrigatória' })
  @MaxLength(255)
  razao_social: string;

  @ApiProperty({
    description: 'CNPJ (apenas dígitos ou formatado)',
    example: '11.222.333/0001-81',
  })
  @IsString()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsCNPJ({ message: 'CNPJ inválido' })
  cnpj: string;

  @ApiProperty({
    description: 'Endereço completo',
    example: 'Av. Industrial, 1000 — São Paulo/SP',
  })
  @IsString()
  @Trim()
  @IsNotEmpty({ message: 'Endereço é obrigatório' })
  @MaxLength(1000)
  endereco: string;

  @ApiProperty({
    description: 'Nome do responsável pela empresa',
    example: 'João da Silva',
  })
  @IsString()
  @Trim()
  @IsNotEmpty({ message: 'Responsável é obrigatório' })
  @MaxLength(255)
  responsavel: string;

  @ApiPropertyOptional({
    description: 'E-mail de contato da empresa',
    example: 'contato@empresa.com.br',
  })
  @IsOptional()
  @IsEmail({}, { message: 'E-mail de contato inválido' })
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.length > 0
      ? value.trim().toLowerCase()
      : value,
  )
  email_contato?: string | null;

  @ApiPropertyOptional({
    description: 'Logo em data URL (PNG, JPEG ou WebP, máx 2MB)',
  })
  @IsOptional()
  @Matches(/^data:image\/(png|jpeg|webp);base64,/, {
    message:
      'Logo deve ser PNG, JPEG ou WebP em formato data URL (data:image/...;base64,...).',
  })
  logo_url?: string | null;

  @ApiPropertyOptional({
    description: 'Status ativo da empresa',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  status?: boolean = true;
}
