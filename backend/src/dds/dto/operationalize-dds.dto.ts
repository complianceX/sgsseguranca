import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class OperationalizeDdsDto {
  @IsDateString()
  @IsOptional()
  data?: string;

  @IsUUID()
  @IsOptional()
  facilitador_id?: string;

  @IsUUID()
  @IsOptional()
  site_id?: string;
}
