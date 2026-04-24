import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PrivacyGovernanceService,
  SubprocessorRegistryResponse,
  RetentionMatrixResponse,
  TenantOffboardingChecklistResponse,
} from './privacy-governance.service';

@Controller('privacy-governance')
@ApiTags('Privacy Governance')
export class PrivacyGovernanceController {
  constructor(
    private readonly privacyGovernanceService: PrivacyGovernanceService,
  ) {}

  @Get('subprocessors')
  @ApiOperation({
    summary: 'Public technical subprocessor registry',
    description:
      'Lists providers that may process personal data and flags missing contractual evidence.',
  })
  getSubprocessors(): SubprocessorRegistryResponse {
    return this.privacyGovernanceService.getSubprocessors();
  }

  @Get('retention-matrix')
  @ApiOperation({
    summary: 'Technical privacy retention matrix',
    description:
      'Maps data domains to retention, deletion mode, source of truth, and missing evidence.',
  })
  getRetentionMatrix(): RetentionMatrixResponse {
    return this.privacyGovernanceService.getRetentionMatrix();
  }

  @Get('tenant-offboarding-checklist')
  @ApiOperation({
    summary: 'Tenant offboarding privacy checklist',
    description:
      'Lists operational steps and evidence required to close or delete a tenant safely.',
  })
  getTenantOffboardingChecklist(): TenantOffboardingChecklistResponse {
    return this.privacyGovernanceService.getTenantOffboardingChecklist();
  }
}
