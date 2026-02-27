import { PartialType } from '@nestjs/mapped-types';
import { CreateEpiDto } from './create-epi.dto';

export class UpdateEpiDto extends PartialType(CreateEpiDto) {}
