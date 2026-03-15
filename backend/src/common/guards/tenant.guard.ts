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
      // Observabilidade/auditoria: não revela detalhes ao client, mas ajuda a detectar problemas
      // de contexto (ex.: ADMIN_GERAL sem x-company-id quando flag exige tenant explícito).
      const req = context.switchToHttp().getRequest<{
        ip?: string;
        originalUrl?: string;
        url?: string;
        headers?: Record<string, unknown>;
      }>();
      const headerCompanyId = req?.headers?.['x-company-id'] as
        | string
        | undefined;
      this.logger.warn({
        event: 'missing_tenant_context',
        isSuperAdmin,
        requireExplicitForSuperAdmin,
        headerCompanyId,
        ip: req?.ip,
        path: req?.originalUrl || req?.url,
      });
      throw new UnauthorizedException(
        'Contexto de empresa não identificado. Faça login novamente ou selecione uma empresa.',
      );
    }

    return true;
  }
}
