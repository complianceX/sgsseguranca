import { Exclude, Expose, Type } from 'class-transformer';
import { ProfileResponseDto } from '../../profiles/dto/profile-response.dto';

@Exclude()
export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  nome: string;

  @Expose()
  cpf: string;

  @Expose()
  funcao: string;

  @Expose()
  company_id: string;

  @Expose()
  site_id: string;

  @Expose()
  @Type(() => ProfileResponseDto)
  profile: ProfileResponseDto;

  @Expose()
  profile_id: string;

  @Expose()
  status: boolean;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
