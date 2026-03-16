import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';

class DdsParticipantSignatureDto {
  @IsUUID()
  user_id: string;

  @IsString()
  @IsNotEmpty()
  signature_data: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'PIN deve ter 4 a 6 dígitos numéricos.' })
  pin?: string;
}

class TeamPhotoMetadataDto {
  @IsString()
  @IsNotEmpty()
  userAgent: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accuracy?: number;
}

class DdsTeamPhotoDto {
  @IsString()
  @IsNotEmpty()
  imageData: string;

  @IsDateString()
  capturedAt: string;

  @IsString()
  @IsNotEmpty()
  hash: string;

  @ValidateNested()
  @Type(() => TeamPhotoMetadataDto)
  metadata: TeamPhotoMetadataDto;
}

export class ReplaceDdsSignaturesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DdsParticipantSignatureDto)
  participant_signatures: DdsParticipantSignatureDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DdsTeamPhotoDto)
  team_photos?: DdsTeamPhotoDto[];

  @IsOptional()
  @IsString()
  photo_reuse_justification?: string;
}
