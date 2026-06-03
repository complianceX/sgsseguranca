import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn, IsString } from 'class-validator';
import { USER_MODULE_ACCESS_KEYS } from '../user-module-access.config';

export class UpdateUserModuleAccessDto {
  @ApiProperty({
    description: 'Lista de módulos liberados para o usuário',
    type: [String],
    example: ['trainings', 'medical-exams', 'aprs'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsIn(USER_MODULE_ACCESS_KEYS, {
    each: true,
    message: 'module_keys contém um módulo inválido',
  })
  @ArrayUnique()
  module_keys: string[];
}
