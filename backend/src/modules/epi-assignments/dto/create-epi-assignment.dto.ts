import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class EpiSignatureInputDto {
  @IsString()
  @IsNotEmpty()
  signature_data: string;

  @IsString()
  @IsNotEmpty()
  signature_type: string;

  @IsOptional()
  @IsString()
  signer_name?: string;
}

export class CreateEpiAssignmentDto {
  @IsUUID()
  @IsNotEmpty()
  epi_id: string;

  @IsUUID()
  @IsNotEmpty()
  user_id: string;

  @IsOptional()
  @IsUUID()
  site_id?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantidade?: number;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsObject()
  assinatura_entrega: EpiSignatureInputDto;
}
