import { IsString, IsUUID, IsObject, IsOptional } from 'class-validator';

export class FinalizeDocumentDto {
  @IsUUID()
  documentId!: string;

  @IsString()
  tipoDocumento!: string;

  @IsObject()
  dados!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  empresaId?: string;
}
