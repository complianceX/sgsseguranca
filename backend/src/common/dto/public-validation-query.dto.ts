import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class PublicValidationQueryDto {
  @IsString()
  @MaxLength(120)
  @Matches(/^[A-Z0-9-]+$/i, {
    message: 'Formato de código inválido.',
  })
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  token?: string;
}
