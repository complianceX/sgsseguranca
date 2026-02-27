import { IsNotEmpty, IsString, MinLength, Matches } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Senha atual é obrigatória' })
  currentPassword: string;

  @IsString()
  @MinLength(10, { message: 'Nova senha deve ter no mínimo 10 caracteres' })
  @Matches(/[A-Z]/, {
    message: 'Nova senha deve conter ao menos uma letra maiúscula',
  })
  @Matches(/[a-z]/, {
    message: 'Nova senha deve conter ao menos uma letra minúscula',
  })
  @Matches(/[0-9]/, {
    message: 'Nova senha deve conter ao menos um número',
  })
  @Matches(/[^A-Za-z0-9]/, {
    message: 'Nova senha deve conter ao menos um caractere especial',
  })
  newPassword: string;
}
