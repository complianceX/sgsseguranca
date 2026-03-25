import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantPoliciesService } from './tenant-policies.service';

/**
 * Endpoint LGPD para transparência dos prazos de retenção por tenant.
 * O tenant é resolvido pelo contexto autenticado (x-company-id/JWT),
 * sem confiar em company_id vindo do frontend.
 */
@Controller('tenant')
@UseGuards(JwtAuthGuard, TenantGuard)
@UseInterceptors(TenantInterceptor)
export class TenantPoliciesController {
  constructor(private readonly tenantPoliciesService: TenantPoliciesService) {}

  @Get('policies')
  getPolicies(@Query('company_id') companyId?: string) {
    return this.tenantPoliciesService.getCurrentTenantPolicy(companyId);
  }
}
