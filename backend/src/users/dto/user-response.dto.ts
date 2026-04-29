import { Exclude, Expose, Type } from 'class-transformer';
import { ProfileResponseDto } from '../../profiles/dto/profile-response.dto';

@Exclude()
export class UserCompanySummaryDto {
  @Expose()
  id: string;

  @Expose()
  razao_social: string;
}

@Exclude()
export class UserSiteSummaryDto {
  @Expose()
  id: string;

  @Expose()
  nome: string;
}

@Exclude()
export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  nome: string;

  @Expose()
  cpf: string;

  @Expose()
  email: string;

  @Expose()
  funcao: string;

  @Expose()
  company_id: string;

  @Expose()
  @Type(() => UserCompanySummaryDto)
  company?: UserCompanySummaryDto;

  @Expose()
  site_id: string;

  @Expose()
  @Type(() => UserSiteSummaryDto)
  site?: UserSiteSummaryDto;

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
