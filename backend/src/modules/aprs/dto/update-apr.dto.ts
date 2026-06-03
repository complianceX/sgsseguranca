import { IsDateString, IsOptional } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { CreateAprDto } from './create-apr.dto';

export class UpdateAprDto extends PartialType(CreateAprDto) {
  /**
   * Guard de conflito otimista: se fornecido, o backend compara este valor com
   * o `updated_at` atual do registro. Se divergirem, retorna 409 Conflict,
   * indicando que outro cliente atualizou a APR enquanto este estava offline.
   * Usado pelo sistema de sync offline para detectar conflitos antes de sobrescrever.
   */
  @IsDateString()
  @IsOptional()
  _conflict_guard_updated_at?: string;
}
