import { PartialType } from '@nestjs/mapped-types';
import { CreateRdoDto } from './create-rdo.dto';

export class UpdateRdoDto extends PartialType(CreateRdoDto) {}
