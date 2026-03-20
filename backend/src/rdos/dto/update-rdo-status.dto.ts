import { IsIn } from 'class-validator';

export class UpdateRdoStatusDto {
  @IsIn(['rascunho', 'enviado', 'aprovado'])
  status: 'rascunho' | 'enviado' | 'aprovado';
}
