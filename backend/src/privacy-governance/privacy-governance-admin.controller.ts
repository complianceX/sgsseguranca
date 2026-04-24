import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantService } from '../common/tenant/tenant.service';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import {
  PrivacyGovernanceService,
  TenantStorageExpungePlanResponse,
  TenantStorageManifestResponse,
} from './privacy-governance.service';

@Controller('privacy-governance/admin')
@ApiTags('Privacy Governance - Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
export class PrivacyGovernanceAdminController {
  constructor(
    private readonly privacyGovernanceService: PrivacyGovernanceService,
    private readonly tenantService: TenantService,
  ) {}

  @Get('tenant-storage-manifest')
  @ApiOperation({
    summary: 'Build tenant storage manifest for privacy offboarding',
    description:
      'Returns document_registry objects for the current tenant and optionally lists known storage prefixes.',
  })
  getTenantStorageManifest(
    @Query('includeStorageListing') includeStorageListing?: string,
    @Query('limit') limit?: string,
  ): Promise<TenantStorageManifestResponse> {
    const companyId = this.tenantService.getTenantId();
    if (!companyId) {
      throw new BadRequestException(
        'Contexto de empresa obrigatório para gerar manifesto de storage.',
      );
    }

    const parsedLimit =
      typeof limit === 'string' && limit.trim()
        ? Number.parseInt(limit, 10)
        : undefined;
    if (parsedLimit !== undefined && (!Number.isFinite(parsedLimit) || parsedLimit < 1)) {
      throw new BadRequestException('limit deve ser um inteiro positivo.');
    }

    return this.privacyGovernanceService.getTenantStorageManifest(companyId, {
      includeStorageListing: /^true$/i.test(includeStorageListing || ''),
      limit: parsedLimit,
    });
  }

  @Get('tenant-storage-expunge-plan')
  @ApiOperation({
    summary: 'Build dry-run storage expunge plan for privacy offboarding',
    description:
      'Returns objects that would be eligible for physical deletion, without deleting anything.',
  })
  getTenantStorageExpungePlan(
    @Query('limit') limit?: string,
  ): Promise<TenantStorageExpungePlanResponse> {
    const companyId = this.tenantService.getTenantId();
    if (!companyId) {
      throw new BadRequestException(
        'Contexto de empresa obrigatório para gerar plano de expurgo.',
      );
    }

    const parsedLimit =
      typeof limit === 'string' && limit.trim()
        ? Number.parseInt(limit, 10)
        : undefined;
    if (
      parsedLimit !== undefined &&
      (!Number.isFinite(parsedLimit) || parsedLimit < 1)
    ) {
      throw new BadRequestException('limit deve ser um inteiro positivo.');
    }

    return this.privacyGovernanceService.getTenantStorageExpungePlan(companyId, {
      limit: parsedLimit,
    });
  }
}
