import { PartialType } from '@nestjs/mapped-types';
import { CreateCorrectiveActionDto } from './create-corrective-action.dto';

export class UpdateCorrectiveActionDto extends PartialType(
  CreateCorrectiveActionDto,
) {}
