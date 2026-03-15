import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SophieConversationMessageDto {
  @IsString()
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(8000)
  content: string;
}

export class SophieChatDto {
  @IsString()
  @MaxLength(2000)
  question: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SophieConversationMessageDto)
  history?: SophieConversationMessageDto[];
}
