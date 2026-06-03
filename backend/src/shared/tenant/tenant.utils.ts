import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';

export function applyTenantFilter<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  tenantId: string,
  alias?: string,
) {
  const tableAlias = alias || queryBuilder.alias;
  return queryBuilder.andWhere(`${tableAlias}.company_id = :tenantId`, {
    tenantId,
  });
}
