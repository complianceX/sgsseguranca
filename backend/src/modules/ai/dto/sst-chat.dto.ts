import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ConversationMessage } from '../sst-agent/sst-agent.types';

class ConversationMessageDto implements ConversationMessage {
  @IsEnum(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;
}

export class SstChatDto {
  /** Pergunta do usuário para o agente SST. Máximo 2000 caracteres. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question: string;

  /**
   * Histórico da conversa atual (últimas N mensagens).
   * O frontend envia o contexto da sessão para continuidade da conversa.
   * Máximo recomendado: 10 pares de mensagens.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationMessageDto)
  history?: ConversationMessage[];
}
