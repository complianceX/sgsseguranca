import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { CatalogQueryDto } from '../../common/dto/catalog-query.dto';

const OS_STATUSES = ['ativo', 'concluido', 'cancelado'] as const;

const trimOptionalString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class FindServiceOrdersQueryDto extends CatalogQueryDto {
  @IsOptional()
  @Transform(trimOptionalString)
  @IsIn(OS_STATUSES)
  status?: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsUUID()
  site_id?: string;
}
