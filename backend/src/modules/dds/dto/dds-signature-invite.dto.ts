import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class IssueDdsSignatureInvitesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  participant_user_ids?: string[];

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(30)
  expires_in_days?: number;
}

export class SubmitPublicDdsSignatureDto {
  @IsBoolean()
  accepted_terms: boolean;

  @IsString()
  @MaxLength(300_000)
  signature_data: string;
}
