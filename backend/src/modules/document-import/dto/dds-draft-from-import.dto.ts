import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDdsDraftFromImportDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  tema!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(50000)
  conteudo?: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  data!: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  site_id!: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  facilitador_id!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  @ArrayMaxSize(50)
  participants?: string[];
}

export class DdsDraftFromImportPreviewDto {
  @ApiProperty()
  @IsString()
  tema!: string;

  @ApiProperty()
  @IsString()
  conteudo!: string;

  @ApiProperty()
  @IsDateString()
  data!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  participantesSugeridos?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  pendencias?: string[];
}

export class DdsDraftFromImportResponseDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  documentId!: string;

  @ApiProperty({ type: () => DdsDraftFromImportPreviewDto })
  preview!: DdsDraftFromImportPreviewDto;
}

export class CreateDdsDraftFromImportResponseDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  documentId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsString()
  ddsId!: string;

  @ApiProperty()
  @IsString()
  status!: string;
}
