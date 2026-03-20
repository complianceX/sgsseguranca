import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  CHECKLIST_ITEM_RESPONSE_TYPE_VALUES,
  CHECKLIST_ITEM_STATUS_VALUES,
} from '../types/checklist-item.type';

export class ChecklistItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty({ message: 'O item do checklist é obrigatório.' })
  item: string;

  @IsOptional()
  @IsIn([true, false, ...CHECKLIST_ITEM_STATUS_VALUES], {
    message: 'Status do item do checklist inválido.',
  })
  status?: boolean | (typeof CHECKLIST_ITEM_STATUS_VALUES)[number];

  @IsOptional()
  @IsIn(CHECKLIST_ITEM_RESPONSE_TYPE_VALUES, {
    message: 'Tipo de resposta do item do checklist inválido.',
  })
  tipo_resposta?: (typeof CHECKLIST_ITEM_RESPONSE_TYPE_VALUES)[number];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  obrigatorio?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  peso?: number;

  @IsOptional()
  resposta?: unknown;

  @IsOptional()
  @IsString()
  observacao?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fotos?: string[];
}
