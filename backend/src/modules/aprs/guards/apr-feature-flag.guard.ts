import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APR_FEATURE_FLAG_KEY } from '../decorators/apr-feature-flag.decorator';
import { AprFeatureFlagService } from '../services/apr-feature-flag.service';
import { TenantService } from '../../../shared/tenant/tenant.service';

@Injectable()
export class AprFeatureFlagGuard implements CanActivate {
  private readonly logger = new Logger(AprFeatureFlagGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlagService: AprFeatureFlagService,
    private readonly tenantService: TenantService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<string | undefined>(
      APR_FEATURE_FLAG_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!key) {
      return true;
    }

    const tenantId = this.tenantService.getTenantId();

    let enabled: boolean;
    try {
      enabled = await this.featureFlagService.isEnabled(key, tenantId);
    } catch (err) {
      this.logger.warn(
        `Falha ao verificar feature flag "${key}" para tenant "${tenantId}"; permitindo acesso por padrão. Erro: ${err instanceof Error ? err.message : String(err)}`,
      );
      return true;
    }

    if (!enabled) {
      throw new ForbiddenException('Funcionalidade não disponível');
    }

    return true;
  }
}
