import { SetMetadata } from '@nestjs/common';

export const TENANT_THROTTLE_KEY = 'tenant_throttle';

export interface TenantThrottleOptions {
  /** Máximo de requisições por minuto para esta rota, independente do plano. */
  requestsPerMinute: number;
  /** Máximo de requisições por hora (opcional — usa plano se omitido). */
  requestsPerHour?: number;
}

/**
 * Sobrescreve o rate limit padrão do plano para uma rota específica.
 * Lido pelo TenantRateLimitGuard para aplicar limites mais restritivos
 * em endpoints custosos (ex: exportação, IA, relatórios).
 *
 * @example
 *   @TenantThrottle({ requestsPerMinute: 5 })
 *   @Post('export/excel')
 *   async export() { ... }
 */
export const TenantThrottle = (options: TenantThrottleOptions) =>
  SetMetadata(TENANT_THROTTLE_KEY, options);
