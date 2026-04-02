import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ChecklistItemDto } from './checklist-item.dto';
import {
  CHECKLIST_BARRIER_STATUS_VALUES,
  CHECKLIST_BARRIER_TYPE_VALUES,
} from '../types/checklist-item.type';

export class ChecklistTopicDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty({ message: 'O título do tópico é obrigatório.' })
  titulo: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsIn(CHECKLIST_BARRIER_TYPE_VALUES, {
    message: 'Tipo de barreira inválido.',
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
  @IsIn(CHECKLIST_BARRIER_STATUS_VALUES, {
    message: 'Status da barreira inválido.',
  })
  status_barreira?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  controles_rompidos?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  controles_degradados?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  controles_pendentes?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  bloqueia_operacao?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ordem?: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Adicione pelo menos um item ao tópico.' })
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  itens: ChecklistItemDto[];
}
