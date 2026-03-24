import { IsString, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsCPF } from '../../common/validators/cpf.validator';

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsCPF({ message: 'CPF inválido' })
  cpf: string;
}
