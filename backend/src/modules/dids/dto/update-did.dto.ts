import { PartialType } from '@nestjs/mapped-types';
import { CreateDidDto } from './create-did.dto';

export class UpdateDidDto extends PartialType(CreateDidDto) {}
