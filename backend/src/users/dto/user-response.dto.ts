import { Exclude, Expose, Type } from 'class-transformer';
import { ProfileResponseDto } from '../../profiles/dto/profile-response.dto';
import {
  UserAccessStatus,
  UserIdentityType,
} from '../constants/user-identity.constant';

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
  site_ids?: string[];

  @Expose()
  @Type(() => UserSiteSummaryDto)
  sites?: UserSiteSummaryDto[];

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
  module_access_keys?: string[];

  @Expose()
  identity_type: UserIdentityType;

  @Expose()
  access_status: UserAccessStatus;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
