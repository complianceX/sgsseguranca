import { IsOptional, IsString, Matches } from 'class-validator';

export class SetSignaturePinDto {
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'PIN deve ter 4 a 6 dígitos numéricos.' })
  pin: string;

  @IsOptional()
  @IsString()
  current_password?: string;
}
