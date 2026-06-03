import { Exclude, Expose } from 'class-transformer';
import { ProfilePermissions } from '../types/profile-permissions.type';

@Exclude()
export class ProfileResponseDto {
  @Expose()
  id: string;

  @Expose()
  nome: string;

  @Expose()
  permissoes: ProfilePermissions;

  @Expose()
  status: boolean;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
