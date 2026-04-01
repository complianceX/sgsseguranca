import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { CHECKLIST_ITEM_STATUS_VALUES } from '../types/checklist-item.type';

export class ChecklistSubitemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @ValidateIf((object) => !object.descricao)
  @IsString()
  @IsNotEmpty({ message: 'O texto do subitem é obrigatório.' })
  texto?: string;

  @ValidateIf((object) => !object.texto)
  @IsString()
  @IsNotEmpty({ message: 'A descrição do subitem é obrigatória.' })
  descricao?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ordem?: number;

  @IsOptional()
  @IsIn([true, false, ...CHECKLIST_ITEM_STATUS_VALUES], {
    message: 'Status do subitem do checklist inválido.',
  })
  status?: boolean | (typeof CHECKLIST_ITEM_STATUS_VALUES)[number];

  @IsOptional()
  resposta?: unknown;

  @IsOptional()
  @IsString()
  observacao?: string;
}
