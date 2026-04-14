import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class VerifyLoginMfaDto {
  @IsString()
  challengeToken: string;

  @IsString()
  @MinLength(6)
  code: string;
}

export class ActivateBootstrapMfaDto {
  @IsString()
  challengeToken: string;

  @IsString()
  @MinLength(6)
  code: string;
}

export class ActivateMfaEnrollmentDto {
  @IsString()
  @MinLength(6)
  code: string;
}

export class DisableMfaDto {
  @IsString()
  @MinLength(6)
  code: string;
}

export class VerifyStepUpDto {
  @IsString()
  @Length(3, 120)
  reason: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class MfaStatusResponseDto {
  enabled: boolean;
  required: boolean;
  privilegedRole: string;
  recoveryCodesRemaining: number;
}

export class MfaChallengeResponseDto {
  mfaRequired: true;
  challengeToken: string;
  expiresIn: number;
  methods: string[];
}

export class MfaBootstrapResponseDto {
  mfaEnrollRequired: true;
  challengeToken: string;
  expiresIn: number;
  otpAuthUrl: string;
  manualEntryKey: string;
  recoveryCodes: string[];
}

export class CompleteMfaSessionDto {
  accessToken: string;
  user: unknown;
  roles: string[];
  permissions: string[];
}
