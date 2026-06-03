import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { PrivacyRequestStatus } from '../entities/privacy-request.entity';

export const PRIVACY_REQUEST_STATUSES: PrivacyRequestStatus[] = [
  'open',
  'in_review',
  'waiting_controller',
  'fulfilled',
  'rejected',
  'cancelled',
];

export class UpdatePrivacyRequestDto {
  @IsIn(PRIVACY_REQUEST_STATUSES)
  status: PrivacyRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  response_summary?: string;
}
