import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Trim } from 'class-sanitizer';
import { Transform } from 'class-transformer';

export class ChatContextDto {
  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  userName?: string;

  @IsString()
  @IsOptional()
  currentPath?: string;
}

export class ChatDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsNotEmpty({ message: 'Mensagem é obrigatória' })
  message: string;

  @ValidateNested()
  @Type(() => ChatContextDto)
  @IsOptional()
  context?: ChatContextDto;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryItemDto)
  conversationHistory?: ChatHistoryItemDto[];
}

export class ChatHistoryItemDto {
  @IsString()
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}
