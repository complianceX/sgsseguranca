import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { CursorPageQueryDto } from '../../common/dto/cursor-page-query.dto';

const TIPOS_EXAME = [
  'admissional',
  'periodico',
  'retorno',
  'demissional',
  'mudanca_funcao',
] as const;
const RESULTADOS = ['apto', 'inapto', 'apto_com_restricoes'] as const;

const trimOptionalString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class FindMedicalExamsQueryDto extends CursorPageQueryDto {
  @IsOptional()
  @Transform(trimOptionalString)
  @IsIn(TIPOS_EXAME)
  tipo_exame?: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsIn(RESULTADOS)
  resultado?: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsUUID()
  user_id?: string;
}
