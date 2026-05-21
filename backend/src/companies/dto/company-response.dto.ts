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
  logo_url?: string | null;

  @Expose()
  status: boolean;

  @Expose()
  account_status: string;

  @Expose()
  trial_started_at?: Date | null;

  @Expose()
  trial_ends_at?: Date | null;

  @Expose()
  activated_at?: Date | null;

  @Expose()
  suspended_at?: Date | null;

  @Expose()
  suspension_reason?: string | null;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
