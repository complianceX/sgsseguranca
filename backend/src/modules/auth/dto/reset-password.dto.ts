import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @Length(64, 64, {
    message: 'Token de redefinição deve ter 64 caracteres hexadecimais.',
  })
  @Matches(/^[a-f0-9]{64}$/i, {
    message: 'Token de redefinição inválido.',
  })
  token: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}
