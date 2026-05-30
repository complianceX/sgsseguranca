import { Transform } from 'class-transformer';
import { IsUUID, Matches, MaxLength } from 'class-validator';

export class RemoveSignaturesByDocumentParamDto {
  @IsUUID('4')
  document_id: string;
}

export class RemoveSignaturesByDocumentQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MaxLength(32)
  @Matches(/^[A-Z_]{2,32}$/)
  document_type: string;
}
