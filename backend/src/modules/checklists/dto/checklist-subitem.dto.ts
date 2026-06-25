import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { sanitizePlainTextTransform } from '../../../shared/utils/plain-text-sanitizer.util';
import {
  CHECKLIST_ITEM_STATUS_VALUES,
  type ChecklistItemStatus,
} from '../types/checklist-item.type';

export class ChecklistSubitemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @ValidateIf((object: { descricao?: string }) => !object.descricao)
  @IsString()
  @IsNotEmpty({ message: 'O texto do subitem é obrigatório.' })
  @Transform(sanitizePlainTextTransform)
  texto?: string;

  @ValidateIf((object: { texto?: string }) => !object.texto)
  @IsString()
  @IsNotEmpty({ message: 'A descrição do subitem é obrigatória.' })
  @Transform(sanitizePlainTextTransform)
  descricao?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ordem?: number;

  @IsOptional()
  @IsIn([true, false, ...CHECKLIST_ITEM_STATUS_VALUES], {
    message: 'Status do subitem do checklist inválido.',
  })
  status?: ChecklistItemStatus;

  @IsOptional()
  resposta?: unknown;

  @IsOptional()
  @IsString()
  @Transform(sanitizePlainTextTransform)
  observacao?: string;
}
