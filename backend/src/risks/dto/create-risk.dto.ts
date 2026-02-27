import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';

export class CreateRiskDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsNotEmpty({ message: 'Nome do risco é obrigatório' })
  nome: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsNotEmpty({ message: 'Categoria é obrigatória' })
  categoria: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  descricao?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  medidas_controle?: string;

  @IsBoolean()
  @IsOptional()
  status?: boolean = true;

  @IsUUID('4', { message: 'ID de empresa inválido' })
  @IsNotEmpty({ message: 'Empresa é obrigatória' })
  company_id: string;
}
