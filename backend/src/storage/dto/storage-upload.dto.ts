import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsHexadecimal,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePresignedUploadRequestDto {
  @ApiProperty({
    example: 'apr-2026-04-13.pdf',
    description: 'Nome original do arquivo PDF a ser enviado para quarentena.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename!: string;

  @ApiPropertyOptional({
    example: 'application/pdf',
    default: 'application/pdf',
    description: 'Tipo MIME aceito neste fluxo. Apenas application/pdf.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contentType?: string;
}

export class CreatePresignedUploadResponseDto {
  @ApiProperty({
    example: 'https://bucket.example.com/signed-put-url',
    description: 'URL presignada para upload direto no storage.',
  })
  uploadUrl!: string;

  @ApiProperty({
    example:
      'quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf',
    description:
      'Chave temporária em quarentena. Esta chave ainda não representa um documento promovido.',
  })
  fileKey!: string;

  @ApiProperty({
    example: 600,
    description: 'TTL da URL presignada de upload, em segundos.',
  })
  expiresIn!: number;
}

export class CompleteUploadRequestDto {
  @ApiProperty({
    example:
      'quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf',
    description:
      'Chave temporária retornada por POST /storage/presigned-url após o upload físico do arquivo.',
  })
  @IsString()
  @IsNotEmpty()
  fileKey!: string;

  @ApiPropertyOptional({
    example: 'apr-2026-04-13.pdf',
    description: 'Nome original do arquivo enviado pelo cliente.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  originalFilename?: string;

  @ApiPropertyOptional({
    example:
      '6a2da20943999e6cb59f8f2c1dcf20f7a3e827d06c740f243f6e79b6f06304f4',
    description:
      'SHA-256 calculado pelo cliente para validar integridade antes da promoção.',
  })
  @IsOptional()
  @IsHexadecimal()
  @MaxLength(64)
  sha256?: string;
}

export class CompleteUploadResponseDto {
  @ApiProperty({
    example:
      'documents/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.pdf',
    description:
      'Chave final promovida para o namespace governado de documentos.',
  })
  fileKey!: string;

  @ApiProperty({
    example: 248113,
    description: 'Tamanho final validado do arquivo promovido.',
  })
  sizeBytes!: number;

  @ApiProperty({
    example: true,
    description:
      'Indica se o SHA-256 enviado pelo cliente foi verificado com sucesso no backend.',
  })
  sha256Verified!: boolean;
}
