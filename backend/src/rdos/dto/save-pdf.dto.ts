import { IsString, IsNotEmpty } from 'class-validator';

export class SavePdfDto {
  @IsString()
  @IsNotEmpty()
  filename: string;
}
