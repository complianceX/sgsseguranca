import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class FindSignaturesQueryDto {
  @Transform(trimString)
  @IsUUID('4')
  document_id: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[A-Za-z_]{2,32}$/)
  document_type: string;
}
