import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';

export class CreateSiteDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsNotEmpty({ message: 'Nome da obra/setor é obrigatório' })
  nome: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  local?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  endereco?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  cidade?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  estado?: string;

  @IsBoolean()
  @IsOptional()
  status?: boolean = true;

  @IsUUID('4', { message: 'ID de empresa inválido' })
  @IsNotEmpty({ message: 'Empresa é obrigatória' })
  company_id: string;
}
