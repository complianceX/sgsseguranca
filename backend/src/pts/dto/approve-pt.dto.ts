import { IsOptional, IsString } from 'class-validator';

export class ApprovePtDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
