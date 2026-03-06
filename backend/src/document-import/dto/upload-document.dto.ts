import { IsString, IsOptional, IsObject, IsUUID } from 'class-validator';

export class UploadDocumentDto {
  // Importante: em ambiente multi-tenant, o empresaId vem do contexto do token.
  // Mantemos este campo como opcional apenas para compatibilidade de clientes antigos.
  @IsOptional()
  @IsUUID('4', { message: 'O ID da empresa deve ser um UUID válido' })
  empresaId?: string;

  @IsOptional()
  @IsString({ message: 'O tipo de documento deve ser uma string' })
  tipoDocumento?: string;

  @IsOptional()
  @IsObject({ message: 'Metadados devem ser um objeto' })
  metadados?: Record<string, any>;
}
