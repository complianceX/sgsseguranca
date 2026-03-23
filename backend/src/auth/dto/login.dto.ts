import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsCPF } from '../../common/validators/cpf.validator';

export class LoginDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsCPF({ message: 'CPF inválido' })
  cpf: string;

  @IsString()
  @IsNotEmpty({ message: 'Senha é obrigatória' })
  @MaxLength(256, { message: 'Senha excede o tamanho máximo permitido' })
  password: string;
}
