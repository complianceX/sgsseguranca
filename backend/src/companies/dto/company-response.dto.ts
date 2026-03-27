import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class CompanyResponseDto {
  @Expose()
  id: string;

  @Expose()
  razao_social: string;

  @Expose()
  cnpj: string;

  @Expose()
  endereco: string;

  @Expose()
  responsavel: string;

  @Expose()
  email_contato?: string | null;

  @Expose()
  logo_url?: string;

  @Expose()
  status: boolean;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
