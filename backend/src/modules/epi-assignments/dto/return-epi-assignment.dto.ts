import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { EpiSignatureInputDto } from './create-epi-assignment.dto';

export class ReturnEpiAssignmentDto {
  @IsObject()
  assinatura_devolucao: EpiSignatureInputDto;

  @IsOptional()
  @IsString()
  motivo_devolucao?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class ReplaceEpiAssignmentDto {
  @IsString()
  @IsNotEmpty()
  motivo_substituicao: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
