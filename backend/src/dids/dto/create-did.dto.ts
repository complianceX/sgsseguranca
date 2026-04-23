import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmpty,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDidDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(255)
  titulo: string;

  @IsString()
  @IsOptional()
  descricao?: string;

  @IsDateString()
  @IsNotEmpty()
  data: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  turno?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  frente_trabalho?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(255)
  atividade_principal: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  atividades_planejadas: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  riscos_operacionais: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  controles_planejados: string;

  @IsString()
  @IsOptional()
  epi_epc_aplicaveis?: string;

  @IsString()
  @IsOptional()
  observacoes?: string;

  @IsOptional()
  @IsEmpty({
    message:
      'company_id não é permitido no payload. O tenant autenticado define a empresa.',
  })
  company_id?: never;

  @IsUUID()
  @IsNotEmpty()
  site_id: string;

  @IsUUID()
  @IsNotEmpty()
  responsavel_id: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  participants: string[];
}
