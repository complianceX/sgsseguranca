import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';

export class GeneratePdfReportDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;
}
