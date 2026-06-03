import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ConsentType } from '../entities/consent-version.entity';

export const CONSENT_TYPES: readonly ConsentType[] = [
  'privacy',
  'terms',
  'cookies',
  'ai_processing',
  'marketing',
] as const;

export class AcceptConsentDto {
  @ApiProperty({
    enum: CONSENT_TYPES,
    example: 'ai_processing',
    description: 'Tipo do consentimento a ser aceito.',
  })
  @IsString()
  @IsIn(CONSENT_TYPES as unknown as string[])
  type: ConsentType;

  @ApiProperty({
    example: '2026-05-01',
    nullable: true,
    description:
      'Rótulo da versão aceita. Se ausente, assume-se a versão ativa (retired_at IS NULL).',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  versionLabel?: string;
}
