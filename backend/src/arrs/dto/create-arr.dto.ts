import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmpty,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const ARR_NIVEIS_RISCO = ['baixo', 'medio', 'alto', 'critico'] as const;
const ARR_PROBABILIDADES = ['baixa', 'media', 'alta'] as const;
const ARR_SEVERIDADES = ['leve', 'moderada', 'grave', 'critica'] as const;

export class CreateArrDto {
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
  condicao_observada: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  risco_identificado: string;

  @IsString()
  @IsIn(ARR_NIVEIS_RISCO)
  nivel_risco: string;

  @IsString()
  @IsIn(ARR_PROBABILIDADES)
  probabilidade: string;

  @IsString()
  @IsIn(ARR_SEVERIDADES)
  severidade: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  controles_imediatos: string;

  @IsString()
  @IsOptional()
  acao_recomendada?: string;

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
