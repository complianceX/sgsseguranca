import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from 'class-sanitizer';
import { ProfilePermissions } from '../types/profile-permissions.type';

export class CreateProfileDto {
  @IsString()
  @Trim()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.replace(/<script.*?>/gi, '')
      : (value as string),
  )
  @IsNotEmpty({ message: 'Nome do perfil é obrigatório' })
  nome: string;

  @IsNotEmpty({ message: 'Permissões são obrigatórias' })
  permissoes: ProfilePermissions;

  @IsBoolean()
  @IsOptional()
  status?: boolean = true;
}
