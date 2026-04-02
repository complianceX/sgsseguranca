import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  CHECKLIST_BARRIER_TYPE_VALUES,
  CHECKLIST_ITEM_CRITICALITY_VALUES,
  CHECKLIST_ITEM_RESPONSE_TYPE_VALUES,
  CHECKLIST_ITEM_STATUS_VALUES,
} from '../types/checklist-item.type';
import { ChecklistSubitemDto } from './checklist-subitem.dto';

export class ChecklistItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty({ message: 'O item do checklist é obrigatório.' })
  item: string;

  @IsOptional()
  @IsString()
  topico_id?: string;

  @IsOptional()
  @IsString()
  topico_titulo?: string;

  @IsOptional()
  @IsString()
  topico_descricao?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ordem_topico?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ordem_item?: number;

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
  @IsIn(CHECKLIST_ITEM_CRITICALITY_VALUES, {
    message: 'Criticidade do item do checklist inválida.',
  })
  criticidade?: (typeof CHECKLIST_ITEM_CRITICALITY_VALUES)[number];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  bloqueia_operacao_quando_nc?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  exige_foto_quando_nc?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  exige_observacao_quando_nc?: boolean;

  @IsOptional()
  @IsString()
  acao_corretiva_imediata?: string;

  @IsOptional()
  @IsIn(CHECKLIST_BARRIER_TYPE_VALUES, {
    message: 'Tipo de barreira do checklist inválido.',
  })
  barreira_tipo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  peso_barreira?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limite_ruptura?: number;

  @IsOptional()
  resposta?: unknown;

  @IsOptional()
  @IsString()
  observacao?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fotos?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistSubitemDto)
  subitens?: ChecklistSubitemDto[];
}
