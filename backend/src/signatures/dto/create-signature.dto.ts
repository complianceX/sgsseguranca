import { IsOptional, IsString, IsNotEmpty, IsUUID, Matches } from 'class-validator';

export class CreateSignatureDto {
  // Ignorado no backend por segurança; user_id efetivo vem do JWT.
  @IsOptional()
  @IsUUID()
  user_id: string;

  @IsString()
  @IsNotEmpty()
  document_id: string;

  @IsString()
  @IsNotEmpty()
  document_type: string;

  @IsString()
  @IsNotEmpty()
  signature_data: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsOptional()
  @IsUUID()
  company_id?: string;

  @IsOptional()
  @IsString()
  signature_hash?: string;

  @IsOptional()
  @IsString()
  timestamp_token?: string;

  @IsOptional()
  @IsString()
  timestamp_authority?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'PIN deve ter 4 a 6 dígitos numéricos.' })
  pin?: string;
}
