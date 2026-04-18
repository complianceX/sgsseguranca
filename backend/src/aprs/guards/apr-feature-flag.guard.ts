import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APR_FEATURE_FLAG_KEY } from '../decorators/apr-feature-flag.decorator';
import { AprFeatureFlagService } from '../services/apr-feature-flag.service';
import { TenantService } from '../../common/tenant/tenant.service';

@Injectable()
export class AprFeatureFlagGuard implements CanActivate {
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
    const enabled = await this.featureFlagService.isEnabled(key, tenantId);

    if (!enabled) {
      throw new ForbiddenException('Funcionalidade não disponível');
    }

    return true;
  }
}
