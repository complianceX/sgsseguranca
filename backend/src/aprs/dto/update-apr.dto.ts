import { PartialType } from '@nestjs/mapped-types';
import { CreateAprDto } from './create-apr.dto';

export class UpdateAprDto extends PartialType(CreateAprDto) {}
