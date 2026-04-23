import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class FindSignaturesQueryDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  document_id: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  document_type: string;
}
