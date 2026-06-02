import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CloseCatDto {
  @IsString()
  @IsNotEmpty()
  plano_acao_fechamento: string;

  @IsOptional()
  @IsString()
  licoes_aprendidas?: string;

  @IsOptional()
  @IsString()
  causa_raiz?: string;
}
