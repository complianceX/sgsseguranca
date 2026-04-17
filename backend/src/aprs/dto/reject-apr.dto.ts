import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const APR_TRANSITION_REASON_MAX_LENGTH = 2000;

export class RejectAprDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(APR_TRANSITION_REASON_MAX_LENGTH)
  reason: string;
}
