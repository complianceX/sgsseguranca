import { SetMetadata } from '@nestjs/common';

export const TENANT_OPTIONAL_KEY = 'tenant_optional';

/**
 * Marca uma rota/controller como "tenant opcional".
 *
 * Útil para recursos globais (ex.: companies/profiles) que não dependem de company_id.
 * Também permite que ADMIN_GERAL acesse a rota sem enviar `x-company-id` quando
 * REQUIRE_EXPLICIT_TENANT_FOR_SUPER_ADMIN=true.
 */
export const TenantOptional = () => SetMetadata(TENANT_OPTIONAL_KEY, true);

