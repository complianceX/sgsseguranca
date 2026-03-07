import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantService } from '../tenant/tenant.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TENANT_OPTIONAL_KEY } from '../decorators/tenant-optional.decorator';

@Injectable()
export class TenantRequiredGuard implements CanActivate {
  constructor(
    private tenantService: TenantService,
    private reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const tenantOptional = this.reflector.getAllAndOverride<boolean>(
      TENANT_OPTIONAL_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (tenantOptional) return true;

    const requireExplicitForSuperAdmin =
      process.env.NODE_ENV === 'production' ||
      process.env.REQUIRE_EXPLICIT_TENANT_FOR_SUPER_ADMIN === 'true';

    // isSuperAdmin é setado pelo TenantMiddleware a partir do JWT,
    // antes de qualquer guard ser executado.
    // request.user ainda NÃO está disponível aqui (JwtAuthGuard é route-level).
    if (this.tenantService.isSuperAdmin() && !requireExplicitForSuperAdmin) {
      return true;
    }

    const tenantId = this.tenantService.getTenantId();

    if (!tenantId) {
      throw new UnauthorizedException(
        'Contexto de empresa não identificado. Faça login novamente ou selecione uma empresa.',
      );
    }

    return true;
  }
}
