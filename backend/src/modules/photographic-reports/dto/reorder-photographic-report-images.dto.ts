import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ReorderPhotographicReportImagesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  imageIds: string[];
}
