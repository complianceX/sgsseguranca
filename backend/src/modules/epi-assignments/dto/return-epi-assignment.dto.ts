import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { EpiSignatureInputDto } from './create-epi-assignment.dto';

export class ReturnEpiAssignmentDto {
  @IsObject()
  assinatura_devolucao: EpiSignatureInputDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  motivo_devolucao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class ReplaceEpiAssignmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  motivo_substituicao: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}
