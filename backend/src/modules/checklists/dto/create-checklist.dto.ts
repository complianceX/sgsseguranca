import {
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsUUID,
  IsEnum,
  IsBoolean,
  ValidateNested,
  ValidateIf,
  ArrayMinSize,
  IsEmpty,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Trim } from 'class-sanitizer';
import { ChecklistItemDto } from './checklist-item.dto';
import { ChecklistTopicDto } from './checklist-topic.dto';
import {
  CHECKLIST_STATUS_VALUES,
  type ChecklistStatus,
} from '../types/checklist-item.type';

/** Remove script blocks, inline event handlers e javascript: URIs de campos de texto livre. */
function sanitizeTextField(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi, '')
    .replace(/<\/script\s*>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

export class CreateChecklistDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) => sanitizeTextField(value))
  @IsNotEmpty({ message: 'Título é obrigatório' })
  titulo: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) => sanitizeTextField(value))
  @IsOptional()
  descricao?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) => sanitizeTextField(value))
  @IsOptional()
  equipamento?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) => sanitizeTextField(value))
  @IsOptional()
  maquina?: string;

  @IsString()
  @IsOptional()
  foto_equipamento?: string;

  @IsDateString({}, { message: 'Data inválida' })
  @IsNotEmpty({ message: 'Data é obrigatória' })
  data: string;

  @IsOptional()
  @IsEmpty({
    message:
      'company_id não é permitido no payload. O tenant autenticado define a empresa.',
  })
  company_id?: never;

  @IsString()
  @IsOptional()
  @IsEnum(CHECKLIST_STATUS_VALUES, {
    message: 'Status inválido. Use Conforme, Não Conforme ou Pendente',
  })
  status?: ChecklistStatus;

  @IsUUID('4', { message: 'ID de obra inválido' })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) =>
      (value === '' ? null : value) as string | null,
  )
  site_id: string;

  @IsUUID('4', { message: 'ID de inspetor inválido' })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) =>
      (value === '' ? null : value) as string | null,
  )
  inspetor_id: string;

  @ValidateIf(
    (value: CreateChecklistDto) =>
      !Array.isArray(value.topicos) || value.topicos.length === 0,
  )
  @IsArray({ message: 'Os itens do checklist devem ser enviados em um array.' })
  @ArrayMinSize(1, {
    message: 'Adicione pelo menos um item ou tópico ao checklist.',
  })
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  itens?: ChecklistItemDto[];

  @ValidateIf(
    (value: CreateChecklistDto) =>
      !Array.isArray(value.itens) || value.itens.length === 0,
  )
  @IsArray({
    message: 'Os tópicos do checklist devem ser enviados em um array.',
  })
  @ArrayMinSize(1, {
    message: 'Adicione pelo menos um tópico ou item ao checklist.',
  })
  @ValidateNested({ each: true })
  @Type(() => ChecklistTopicDto)
  topicos?: ChecklistTopicDto[];

  @IsBoolean()
  @IsOptional()
  is_modelo?: boolean;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsString()
  @IsOptional()
  periodicidade?: string;

  @IsString()
  @IsOptional()
  nivel_risco_padrao?: string;

  @IsUUID('4', { message: 'ID de auditor inválido' })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) =>
      (value === '' ? null : value) as string | null,
  )
  auditado_por_id?: string;

  @IsDateString({}, { message: 'Data de auditoria inválida' })
  @IsOptional()
  data_auditoria?: string;
}
