import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDetailsDto extends PartialType(
  OmitType(CreateUserDto, ['profile_id'] as const),
) {}
