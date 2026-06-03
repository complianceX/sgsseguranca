import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { PrivacyRequestType } from '../entities/privacy-request.entity';

export const PRIVACY_REQUEST_TYPES: PrivacyRequestType[] = [
  'confirmation',
  'access',
  'correction',
  'anonymization',
  'deletion',
  'portability',
  'sharing_info',
  'consent_revocation',
  'automated_decision_review',
];

export class CreatePrivacyRequestDto {
  @IsIn(PRIVACY_REQUEST_TYPES)
  type: PrivacyRequestType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
