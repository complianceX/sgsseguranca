import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SendStoredDocumentDto {
  @IsString()
  @Transform(trimString)
  @IsNotEmpty({ message: 'documentId é obrigatório.' })
  @MaxLength(120, { message: 'documentId excede o tamanho permitido.' })
  documentId: string;

  @IsString()
  @Transform(trimString)
  @IsNotEmpty({ message: 'documentType é obrigatório.' })
  @MaxLength(40, { message: 'documentType excede o tamanho permitido.' })
  documentType: string;

  @IsEmail({}, { message: 'Email inválido' })
  @Transform(trimString)
  @IsNotEmpty({ message: 'email é obrigatório.' })
  email: string;
}
