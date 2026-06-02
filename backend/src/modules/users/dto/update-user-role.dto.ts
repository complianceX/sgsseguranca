import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpdateUserRoleDto {
  @ApiProperty({
    description: 'ID do perfil/role a ser atribuído ao usuário',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'profile_id deve ser um UUID válido' })
  profile_id: string;
}
