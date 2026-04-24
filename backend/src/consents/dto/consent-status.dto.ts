import { ApiProperty } from '@nestjs/swagger';
import { ConsentType } from '../entities/consent-version.entity';

export class ConsentStatusEntryDto {
  @ApiProperty({ example: 'ai_processing' })
  type: ConsentType;

  @ApiProperty({
    example: true,
    description: 'Se o titular tem um aceite ativo na versão vigente.',
  })
  active: boolean;

  @ApiProperty({ example: '2026-05-01', nullable: true })
  acceptedVersionLabel: string | null;

  @ApiProperty({
    example: '2026-05-01',
    description: 'Label da versão vigente publicada.',
    nullable: true,
  })
  currentVersionLabel: string | null;

  @ApiProperty({ example: false })
  needsReacceptance: boolean;

  @ApiProperty({ example: '2026-04-10T12:00:00.000Z', nullable: true })
  acceptedAt: string | null;

  @ApiProperty({ example: null, nullable: true })
  revokedAt: string | null;

  @ApiProperty({ example: false })
  migratedFromLegacy: boolean;
}

export class ConsentStatusResponseDto {
  @ApiProperty({ type: () => [ConsentStatusEntryDto] })
  consents: ConsentStatusEntryDto[];
}
