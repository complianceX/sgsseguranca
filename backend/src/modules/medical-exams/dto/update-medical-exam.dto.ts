import { PartialType } from '@nestjs/mapped-types';
import { CreateMedicalExamDto } from './create-medical-exam.dto';

export class UpdateMedicalExamDto extends PartialType(CreateMedicalExamDto) {}
