import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateDdsDto } from './create-dds.dto';

export class UpdateDdsDto extends PartialType(
  OmitType(CreateDdsDto, ['company_id'] as const),
) {
  /**
   * Quando uma alteração invalida assinaturas existentes, o cliente deve
   * reenviar a requisição com este campo como `true` para confirmar que está
   * ciente de que as assinaturas serão removidas.
   */
  @IsBoolean()
  @IsOptional()
  confirm_signature_reset?: boolean;
}
