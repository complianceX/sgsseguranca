import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PtEvidencePhotoFase } from '../entities/pt.entity';

/** Metadados da evidência fotográfica (campos texto do multipart). */
export class AttachPtEvidencePhotoDto {
  @IsEnum(['antes', 'durante', 'depois'])
  fase: PtEvidencePhotoFase;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  legenda?: string;
}
