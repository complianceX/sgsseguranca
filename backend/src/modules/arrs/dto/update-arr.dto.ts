import { PartialType } from '@nestjs/mapped-types';
import { CreateArrDto } from './create-arr.dto';

export class UpdateArrDto extends PartialType(CreateArrDto) {}
