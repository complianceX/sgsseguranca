import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  PT_CONDICOES_AREA_ENCERRAMENTO,
  PtCondicaoAreaEncerramento,
} from '../entities/pt.entity';

/**
 * Registro estruturado de devolução/encerramento da PT (NR-33/NR-35):
 * quem encerrou é derivado do usuário autenticado no controller.
 */
export class FinalizePtDto {
  @IsEnum(PT_CONDICOES_AREA_ENCERRAMENTO)
  condicao_area: PtCondicaoAreaEncerramento;

  @IsOptional()
  @IsDateString()
  data_hora_real_fim?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}
