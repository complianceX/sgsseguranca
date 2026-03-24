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
  is_modelo: boolean;

  @Expose()
  is_modelo_padrao: boolean;

  @Expose()
  company_id: string;

  @Expose()
  pdf_file_key?: string | null;

  @Expose()
  pdf_original_name?: string | null;

  @Expose()
  classificacao_resumo?: {
    total: number;
    aceitavel: number;
    atencao: number;
    substancial: number;
    critico: number;
  };
}
