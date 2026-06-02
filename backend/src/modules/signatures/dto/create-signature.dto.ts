import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsUUID,
  Matches,
  IsEmpty,
} from 'class-validator';
import { Transform } from 'class-transformer';

const normalizeDocumentTypeInput = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

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
  @Transform(normalizeDocumentTypeInput)
  document_type: string;

  @IsString()
  @IsNotEmpty()
  signature_data: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsOptional()
  @IsEmpty({
    message:
      'company_id não é permitido no payload. O tenant autenticado define a empresa.',
  })
  company_id?: never;

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
