import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ResolveDocumentPendencyActionDto {
  @IsIn(['open_final_pdf', 'open_governed_video', 'open_governed_attachment'])
  actionKey!:
    | 'open_final_pdf'
    | 'open_governed_video'
    | 'open_governed_attachment';

  @IsString()
  module!: string;

  @IsUUID()
  documentId!: string;

  @IsOptional()
  @IsString()
  attachmentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  attachmentIndex?: number;
}
