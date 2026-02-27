import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';

export class UploadDocumentDto {
  @IsNotEmpty({ message: 'O ID da empresa é obrigatório' })
  @IsString({ message: 'O ID da empresa deve ser uma string' })
  empresaId: string;

  @IsOptional()
  @IsString({ message: 'O tipo de documento deve ser uma string' })
  tipoDocumento?: string;

  @IsOptional()
  @IsObject({ message: 'Metadados devem ser um objeto' })
  metadados?: Record<string, any>;
}
