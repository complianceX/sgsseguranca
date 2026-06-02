import {
  IsBoolean,
  IsEmpty,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';

export class CreateMachineDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsNotEmpty({ message: 'Nome da máquina é obrigatório' })
  nome: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  titulo?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  placa?: string;

  @IsOptional()
  horimetro_atual?: number;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  descricao?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/<script[^>]{0,200}>/gi, '')
      : value,
  )
  @IsOptional()
  requisitos_seguranca?: string;

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
