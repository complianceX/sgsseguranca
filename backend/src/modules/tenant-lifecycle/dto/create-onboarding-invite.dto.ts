import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizePlainTextTransform } from '../../../shared/utils/plain-text-sanitizer.util';
import { Trim } from 'class-sanitizer';

export class CreateOnboardingInviteDto {
  @IsEmail({}, { message: 'E-mail inválido' })
  @Trim()
  email: string;

  @IsOptional()
  @IsString()
  @Trim()
  @Transform(sanitizePlainTextTransform)
  intended_company_name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}
