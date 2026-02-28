import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class AprListItemDto {
  @Expose()
  id: string;

  @Expose()
  numero: string;

  @Expose()
  titulo: string;

  @Expose()
  descricao?: string | null;

  @Expose()
  data_inicio: Date;

  @Expose()
  data_fim: Date;

  @Expose()
  status: string;

  @Expose()
  versao: number;

  @Expose()
  company_id: string;

  @Expose()
  classificacao_resumo?: {
    total: number;
    aceitavel: number;
    atencao: number;
    substancial: number;
    critico: number;
  };
}

