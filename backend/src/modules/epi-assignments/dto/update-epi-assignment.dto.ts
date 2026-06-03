import { PartialType } from '@nestjs/mapped-types';
import { CreateEpiAssignmentDto } from './create-epi-assignment.dto';

export class UpdateEpiAssignmentDto extends PartialType(
  CreateEpiAssignmentDto,
) {}
