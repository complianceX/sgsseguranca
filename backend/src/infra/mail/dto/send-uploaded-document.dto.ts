import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SendUploadedDocumentDto {
  @IsEmail({}, { message: 'Email inválido' })
  @Transform(trimString)
  email: string;

  @IsString()
  @IsOptional()
  @Transform(trimString)
  @MaxLength(160, { message: 'subject excede o tamanho permitido.' })
  subject?: string;

  @IsString()
  @IsOptional()
  @Transform(trimString)
  @MaxLength(180, { message: 'docName excede o tamanho permitido.' })
  docName?: string;
}
