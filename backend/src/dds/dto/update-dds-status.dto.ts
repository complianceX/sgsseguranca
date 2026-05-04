import { IsEnum, IsNotEmpty } from 'class-validator';
import { DdsStatus } from '../entities/dds.entity';

export class UpdateDdsStatusDto {
  @IsEnum(DdsStatus)
  @IsNotEmpty()
  status: DdsStatus;
}
