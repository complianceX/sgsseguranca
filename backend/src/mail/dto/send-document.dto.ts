import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';

export class SendDocumentDto {
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Destinatário é obrigatório' })
  to: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsNotEmpty({ message: 'Assunto é obrigatório' })
  subject: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsNotEmpty({ message: 'Mensagem é obrigatória' })
  message: string;

  @IsString()
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/<script.*?>/gi, '') : value,
  )
  @IsNotEmpty({ message: 'Nome do arquivo é obrigatório' })
  filename: string;

  @IsString()
  @IsNotEmpty({ message: 'Conteúdo do arquivo é obrigatório' })
  base64: string;
}
