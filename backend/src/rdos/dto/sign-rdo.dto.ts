import { IsIn, IsString, IsNotEmpty } from 'class-validator';

export class SignRdoDto {
  @IsIn(['responsavel', 'engenheiro'])
  tipo: 'responsavel' | 'engenheiro';

  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsString()
  @IsNotEmpty()
  cpf: string;
}
