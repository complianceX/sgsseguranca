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
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Trim } from 'class-sanitizer';
import { ChecklistItemDto } from './checklist-item.dto';

export class CreateChecklistDto {
  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsNotEmpty({ message: 'Título é obrigatório' })
  titulo: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  descricao?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  equipamento?: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsOptional()
  maquina?: string;

  @IsString()
  @IsOptional()
  foto_equipamento?: string;

  @IsDateString({}, { message: 'Data inválida' })
  @IsNotEmpty({ message: 'Data é obrigatória' })
  data: string;

  @IsUUID('4', { message: 'ID de empresa inválido' })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) =>
      (value === '' ? null : value) as string | null,
  )
  company_id?: string;

  @IsString()
  @IsOptional()
  @IsEnum(['Conforme', 'Não Conforme', 'Pendente'], {
    message: 'Status inválido. Use Conforme, Não Conforme ou Pendente',
  })
  status?: string;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  itens?: ChecklistItemDto[];

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
    ({ value }: { value: any }) =>
      (value === '' ? null : value) as string | null,
  )
  auditado_por_id?: string;

  @IsDateString({}, { message: 'Data de auditoria inválida' })
  @IsOptional()
  data_auditoria?: string;
}
