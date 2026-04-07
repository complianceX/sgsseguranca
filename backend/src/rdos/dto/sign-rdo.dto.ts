import { IsIn, IsString, IsNotEmpty, Matches, MaxLength, MinLength } from 'class-validator';

export class SignRdoDto {
  @IsIn(['responsavel', 'engenheiro'])
  tipo: 'responsavel' | 'engenheiro';

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  nome: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(14)
  @MaxLength(14)
  @Matches(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, {
    message: 'CPF deve estar no formato XXX.XXX.XXX-XX',
  })
  cpf: string;
}
