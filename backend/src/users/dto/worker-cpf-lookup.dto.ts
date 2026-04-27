import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class WorkerCpfLookupDto {
  @IsString()
  @MinLength(11)
  @MaxLength(14)
  @Matches(/^[0-9.-]+$/, {
    message: 'CPF deve conter apenas números, ponto ou hífen.',
  })
  cpf: string;
}
