import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

const APR_TRANSITION_REASON_MAX_LENGTH = 2000;

export class RejectAprDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(APR_TRANSITION_REASON_MAX_LENGTH)
  reason: string;
}
