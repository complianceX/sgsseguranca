import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class StartCatInvestigationDto {
  @IsString()
  @IsNotEmpty()
  investigacao_detalhes: string;

  @IsOptional()
  @IsString()
  causa_raiz?: string;

  @IsOptional()
  @IsString()
  acao_imediata?: string;
}
