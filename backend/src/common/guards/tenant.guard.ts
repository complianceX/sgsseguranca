import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantService } from '../tenant/tenant.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TENANT_OPTIONAL_KEY } from '../decorators/tenant-optional.decorator';

/**
 * TenantGuard (request-level):
 * - Garante presença de tenant (company_id) para rotas tenant-scoped.
 * - Opcionalmente exige tenant explícito para ADMIN_GERAL via `x-company-id`.
 *
 * Observação: anti-spoofing do header `x-company-id` ocorre no TenantMiddleware.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const tenantOptional = this.reflector.getAllAndOverride<boolean>(
      TENANT_OPTIONAL_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (tenantOptional) return true;

    const requireExplicitForSuperAdmin =
      process.env.REQUIRE_EXPLICIT_TENANT_FOR_SUPER_ADMIN === 'true';

    const isSuperAdmin = this.tenantService.isSuperAdmin();
    const tenantId = this.tenantService.getTenantId();

    if (isSuperAdmin && !requireExplicitForSuperAdmin) {
      return true;
    }

    if (!tenantId) {
      const req = context.switchToHttp().getRequest<{
        ip?: string;
        originalUrl?: string;
        url?: string;
        method?: string;
        headers?: Record<string, unknown>;
      }>();
      const headerCompanyId = req?.headers?.['x-company-id'] as
        | string
        | undefined;
      const userAgent = req?.headers?.['user-agent'] as string | undefined;

      // Forensic audit trail: log enough context for incident investigation
      // without leaking sensitive data (no tokens, no passwords).
      this.logger.warn({
        event: 'cross_tenant_access_denied',
        reason: isSuperAdmin
          ? 'super_admin_missing_explicit_tenant'
          : 'missing_tenant_context',
        isSuperAdmin,
        requireExplicitForSuperAdmin,
        headerCompanyId: headerCompanyId || null,
        ip: req?.ip,
        method: req?.method,
        path: req?.originalUrl || req?.url,
        userAgent: userAgent?.slice(0, 200),
        timestamp: new Date().toISOString(),
      });
      throw new UnauthorizedException(
        'Contexto de empresa não identificado. Faça login novamente ou selecione uma empresa.',
      );
    }

    return true;
  }
}
