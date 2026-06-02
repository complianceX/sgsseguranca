import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class SiteResponseDto {
  @Expose()
  id: string;

  @Expose()
  nome: string;

  @Expose()
  local: string;

  @Expose()
  endereco: string;

  @Expose()
  cidade: string;

  @Expose()
  estado: string;

  @Expose()
  status: boolean;

  @Expose()
  company_id: string;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
