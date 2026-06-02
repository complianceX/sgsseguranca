import { UnauthorizedException } from '@nestjs/common';

export type TenantWhereInput =
  | Record<string, unknown>
  | Array<Record<string, unknown>>;

export type WithTenantOptions = {
  /**
   * Nome da coluna de tenant no banco (padrão: company_id).
   * Use apenas quando o schema é legado (ex.: empresa_id).
   */
  tenantColumn?: string;

  /**
   * Se true, permite companyId ausente (útil para super-admin em endpoints
   * realmente cross-tenant). Por padrão, fail-closed.
   */
  allowMissingTenant?: boolean;
};

/**
 * Helper multi-tenant (defesa em profundidade):
 *
 * withTenant({ id }, companyId) → { id, company_id: companyId }
 *
 * - Evita esquecimento de filtros `company_id` nas queries
 * - Suporta `where` como objeto ou array (OR)
 * - Fail-closed por padrão (companyId obrigatório)
 */
export function withTenant<T extends TenantWhereInput>(
  where: T,
  companyId: string | undefined,
  options: WithTenantOptions = {},
): T {
  const tenantColumn = options.tenantColumn || 'company_id';

  if (!companyId && !options.allowMissingTenant) {
    throw new UnauthorizedException(
      'Contexto de empresa não identificado. Faça login novamente ou selecione uma empresa.',
    );
  }

  if (Array.isArray(where)) {
    return where.map((clause) => ({
      ...clause,
      ...(companyId ? { [tenantColumn]: companyId } : {}),
    })) as T;
  }

  return {
    ...where,
    ...(companyId ? { [tenantColumn]: companyId } : {}),
  } as T;
}
