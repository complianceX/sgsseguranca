import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantService } from '../common/tenant/tenant.service';
import { TenantDocumentPolicy } from './entities/tenant-document-policy.entity';
import { TenantDocumentPolicyResponseDto } from './dto/tenant-document-policy-response.dto';
import {
  resolveDefaultRetentionDaysForModule,
  resolveRetentionColumnForModule,
} from '../common/storage/document-retention.constants';

@Injectable()
export class TenantPoliciesService {
  constructor(
    @InjectRepository(TenantDocumentPolicy)
    private readonly tenantPoliciesRepository: Repository<TenantDocumentPolicy>,
    private readonly tenantService: TenantService,
  ) {}

  async getCurrentTenantPolicy(
  ): Promise<TenantDocumentPolicyResponseDto> {
    const companyId = this.resolveEffectiveCompanyId();
    const policy = await this.getOrCreateByCompanyId(companyId);

    return {
      company_id: policy.company_id,
      retention_days_apr: policy.retention_days_apr,
      retention_days_dds: policy.retention_days_dds,
      retention_days_pts: policy.retention_days_pts,
      updated_at: policy.updated_at,
    };
  }

  async getRetentionDays(
    companyId: string,
    moduleName: string,
  ): Promise<number> {
    const column = resolveRetentionColumnForModule(moduleName);
    if (!column) {
      return resolveDefaultRetentionDaysForModule(moduleName);
    }

    const policy = await this.getOrCreateByCompanyId(companyId);
    const value = Number(policy[column]);

    if (!Number.isFinite(value) || value <= 0) {
      return resolveDefaultRetentionDaysForModule(moduleName);
    }

    return value;
  }

  private async getOrCreateByCompanyId(
    companyId: string,
  ): Promise<TenantDocumentPolicy> {
    const existing = await this.tenantPoliciesRepository.findOne({
      where: { company_id: companyId },
    });

    if (existing) {
      return existing;
    }

    const created = this.tenantPoliciesRepository.create({
      company_id: companyId,
    });
    return this.tenantPoliciesRepository.save(created);
  }

  private resolveEffectiveCompanyId(): string {
    const tenantCompanyId = this.tenantService.getTenantId();
    const effectiveCompanyId = tenantCompanyId;

    if (!effectiveCompanyId) {
      throw new BadRequestException(
        'Empresa não identificada para consultar políticas de retenção.',
      );
    }

    return effectiveCompanyId;
  }
}
