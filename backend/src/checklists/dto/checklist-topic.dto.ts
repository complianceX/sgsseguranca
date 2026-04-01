import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ChecklistItemDto } from './checklist-item.dto';

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
  @Type(() => Number)
  @IsNumber()
  ordem?: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Adicione pelo menos um item ao tópico.' })
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  itens: ChecklistItemDto[];
}
