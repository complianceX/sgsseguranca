import type { UserResponseDto } from '../../users/dto/user-response.dto';

export interface AuthSessionUserDto {
  id: string;
  nome: string;
  cpf: string | null;
  funcao: string | null;
  company_id: string;
  site_id?: string | null;
  profile: UserResponseDto['profile'];
}

export interface AuthSessionResponseDto {
  accessToken: string;
  user: AuthSessionUserDto;
  roles: string[];
  permissions: string[];
}

export interface AuthMfaChallengeResponseDto {
  mfaRequired: true;
  challengeToken: string;
  expiresIn: number;
  methods: string[];
}

export interface AuthMfaBootstrapResponseDto {
  mfaEnrollRequired: true;
  challengeToken: string;
  expiresIn: number;
  otpAuthUrl: string;
  manualEntryKey: string;
  recoveryCodes: string[];
}

export type AuthLoginResponseDto =
  | AuthSessionResponseDto
  | AuthMfaChallengeResponseDto
  | AuthMfaBootstrapResponseDto;

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
