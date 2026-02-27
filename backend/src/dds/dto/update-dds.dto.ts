import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateDdsDto } from './create-dds.dto';

export class UpdateDdsDto extends PartialType(
  OmitType(CreateDdsDto, ['company_id'] as const),
) {}
