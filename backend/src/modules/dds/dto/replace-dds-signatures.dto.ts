import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class DdsParticipantSignatureDto {
  @IsUUID()
  user_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  signature_data: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
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
  @MaxLength(2_000_000)
  imageData: string;

  @IsDateString()
  capturedAt: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  hash: string;

  @ValidateNested()
  @Type(() => TeamPhotoMetadataDto)
  metadata: TeamPhotoMetadataDto;
}

export class ReplaceDdsSignaturesDto {
  @IsArray()
  @ArrayMaxSize(60, { message: 'Máximo 60 assinaturas por requisição.' })
  @ValidateNested({ each: true })
  @Type(() => DdsParticipantSignatureDto)
  participant_signatures: DdsParticipantSignatureDto[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10, { message: 'Máximo 10 fotos de equipe por requisição.' })
  @ValidateNested({ each: true })
  @Type(() => DdsTeamPhotoDto)
  team_photos?: DdsTeamPhotoDto[];

  @IsOptional()
  @IsString()
  photo_reuse_justification?: string;
}
