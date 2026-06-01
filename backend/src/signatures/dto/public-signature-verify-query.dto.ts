import { Transform } from 'class-transformer';
import { IsHexadecimal, Length } from 'class-validator';

export class PublicSignatureVerifyQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsHexadecimal()
  @Length(64, 64)
  hash: string;
}
