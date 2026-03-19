import type { UserResponseDto } from '../../users/dto/user-response.dto';

export interface AuthSessionUserDto {
  id: string;
  nome: string;
  cpf: string | null;
  funcao: string | null;
  company_id: string;
  profile: UserResponseDto['profile'];
}

export interface AuthSessionResponseDto {
  accessToken: string;
  user: AuthSessionUserDto;
  roles: string[];
  permissions: string[];
}

export interface RefreshAccessTokenResponseDto {
  accessToken: string;
}

export interface AuthMeResponseDto {
  user: UserResponseDto;
  roles: string[];
  permissions: string[];
}

export interface SignaturePinStatusResponseDto {
  has_pin: boolean;
}

export interface SignaturePinConfiguredResponseDto {
  ok: true;
  message: string;
}
