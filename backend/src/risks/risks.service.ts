import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Risk } from './entities/risk.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { BaseService } from '../common/base/base.service';
import { RiskHistory } from './entities/risk-history.entity';
import { RiskCalculationService } from '../common/services/risk-calculation.service';
import { RequestContext } from '../common/middleware/request-context.middleware';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';

@Injectable()
export class RisksService extends BaseService<Risk> {
  constructor(
    @InjectRepository(Risk)
    private readonly risksRepository: Repository<Risk>,
    @InjectRepository(RiskHistory)
    private readonly risksHistoryRepository: Repository<RiskHistory>,
    private readonly riskCalculationService: RiskCalculationService,
    private readonly auditService: AuditService,
    tenantService: TenantService,
  ) {
    super(risksRepository, tenantService, 'Risco');
  }

  override async create(data: Partial<Risk>): Promise<Risk> {
    const payload = this.normalizeRiskPayload(data);
    const created = await super.create(payload);
    await this.risksHistoryRepository.save(
      this.risksHistoryRepository.create({
        risk_id: created.id,
        changed_by: RequestContext.getUserId(),
        old_value: {},
        new_value: payload as Record<string, unknown>,
      }),
    );
    await this.auditService.log({
      userId: RequestContext.getUserId() || 'system',
      action: AuditAction.CREATE,
      entity: 'Risk',
      entityId: created.id,
      changes: { before: null, after: this.toHistorySnapshot(created) },
      ip: (RequestContext.get('ip') as string) || 'unknown',
      userAgent: (RequestContext.get('userAgent') as string) || 'unknown',
      companyId: this.getTenantId(),
    });
    return created;
  }

  override async update(id: string, data: Partial<Risk>): Promise<Risk> {
    const current = await this.findOne(id);
    const payload = this.normalizeRiskPayload(data);
    const updated = await super.update(id, payload);

    await this.risksHistoryRepository.save(
      this.risksHistoryRepository.create({
        risk_id: updated.id,
        changed_by: RequestContext.getUserId(),
        old_value: this.toHistorySnapshot(current),
        new_value: this.toHistorySnapshot(updated),
      }),
    );
    await this.auditService.log({
      userId: RequestContext.getUserId() || 'system',
      action: AuditAction.UPDATE,
      entity: 'Risk',
      entityId: updated.id,
      changes: {
        before: this.toHistorySnapshot(current),
        after: this.toHistorySnapshot(updated),
      },
      ip: (RequestContext.get('ip') as string) || 'unknown',
      userAgent: (RequestContext.get('userAgent') as string) || 'unknown',
      companyId: this.getTenantId(),
    });

    return updated;
  }

  private normalizeRiskPayload(data: Partial<Risk>): Partial<Risk> {
    const probability = data.probability ?? null;
    const severity = data.severity ?? null;
    const exposure = data.exposure ?? null;
    const initialRisk = this.riskCalculationService.calculateScore(
      probability,
      severity,
      exposure,
    );
    const inferredResidual =
      data.residual_risk ||
      this.riskCalculationService.classifyByScore(initialRisk) ||
      null;

    return {
      ...data,
      probability,
      severity,
      exposure,
      initial_risk: initialRisk,
      residual_risk: inferredResidual,
      control_evidence: Boolean(data.control_evidence),
    };
  }

  private toHistorySnapshot(risk: Risk): Record<string, unknown> {
    return {
      id: risk.id,
      nome: risk.nome,
      categoria: risk.categoria,
      probability: risk.probability,
      severity: risk.severity,
      exposure: risk.exposure,
      initial_risk: risk.initial_risk,
      residual_risk: risk.residual_risk,
      control_hierarchy: risk.control_hierarchy,
      evidence_photo: risk.evidence_photo,
      evidence_document: risk.evidence_document,
      control_description: risk.control_description,
      control_evidence: risk.control_evidence,
      status: risk.status,
      updated_at: risk.updated_at,
    };
  }
}
