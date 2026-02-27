import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class ProfileResponseDto {
  @Expose()
  id: string;

  @Expose()
  nome: string;

  @Expose()
  permissoes: unknown;

  @Expose()
  status: boolean;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
