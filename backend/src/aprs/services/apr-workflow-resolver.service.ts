import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AprWorkflowConfig,
} from '../entities/apr-workflow-config.entity';
import { AprWorkflowStep } from '../entities/apr-workflow-step.entity';

const FALLBACK_WORKFLOW_ID = '__legacy_fallback__';

@Injectable()
export class AprWorkflowResolverService {
  private readonly logger = new Logger(AprWorkflowResolverService.name);

  constructor(
    @InjectRepository(AprWorkflowConfig)
    private readonly configRepo: Repository<AprWorkflowConfig>,
  ) {}

  async resolveWorkflow(
    tenantId: string,
    siteId?: string,
    activityType?: string,
    criticality?: string,
  ): Promise<AprWorkflowConfig> {
    const candidates = await this.configRepo.find({
      where: { tenantId, isActive: true },
      relations: ['steps'],
      order: { createdAt: 'DESC' },
    });

    const match = this.findBestMatch(
      candidates,
      siteId,
      activityType,
      criticality,
    );

    if (match) {
      return match;
    }

    const globalCandidates = await this.configRepo.find({
      where: { tenantId: null as unknown as string, isActive: true },
      relations: ['steps'],
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });

    const globalMatch = this.findBestMatch(
      globalCandidates,
      siteId,
      activityType,
      criticality,
    );

    if (globalMatch) {
      return globalMatch;
    }

    return this.buildLegacyFallback();
  }

  isFallback(config: AprWorkflowConfig): boolean {
    return config.id === FALLBACK_WORKFLOW_ID;
  }

  private findBestMatch(
    candidates: AprWorkflowConfig[],
    siteId?: string,
    activityType?: string,
    criticality?: string,
  ): AprWorkflowConfig | undefined {
    const priorities: Array<
      (c: AprWorkflowConfig) => boolean
    > = [
      (c) =>
        !!siteId &&
        c.siteId === siteId &&
        !!activityType &&
        c.activityType === activityType &&
        !!criticality &&
        c.criticality === criticality,
      (c) =>
        !!siteId &&
        c.siteId === siteId &&
        !!activityType &&
        c.activityType === activityType &&
        c.criticality === null,
      (c) =>
        !!siteId &&
        c.siteId === siteId &&
        c.activityType === null &&
        c.criticality === null,
      (c) =>
        c.siteId === null &&
        !!activityType &&
        c.activityType === activityType &&
        !!criticality &&
        c.criticality === criticality,
      (c) =>
        c.siteId === null &&
        !!activityType &&
        c.activityType === activityType &&
        c.criticality === null,
      (c) => c.isDefault && c.siteId === null && c.activityType === null,
    ];

    for (const predicate of priorities) {
      const found = candidates.find(predicate);
      if (found) return found;
    }

    return undefined;
  }

  private buildLegacyFallback(): AprWorkflowConfig {
    const fallback = new AprWorkflowConfig();
    fallback.id = FALLBACK_WORKFLOW_ID;
    fallback.name = 'Fluxo Legado (Padrão)';
    fallback.tenantId = null;
    fallback.siteId = null;
    fallback.activityType = null;
    fallback.criticality = null;
    fallback.isDefault = true;
    fallback.isActive = true;
    fallback.createdAt = new Date(0);
    fallback.updatedAt = new Date(0);

    const makeStep = (
      order: number,
      role: string,
      _title: string,
    ): AprWorkflowStep => {
      const s = new AprWorkflowStep();
      s.id = `__legacy_step_${order}__`;
      s.workflowConfigId = FALLBACK_WORKFLOW_ID;
      s.stepOrder = order;
      s.roleName = role;
      s.isRequired = true;
      s.canDelegate = false;
      s.timeoutHours = null;
      s.createdAt = new Date(0);
      s.updatedAt = new Date(0);
      return s;
    };

    fallback.steps = [
      makeStep(
        1,
        'Técnico de Segurança do Trabalho (TST)',
        'Validação técnica SST',
      ),
      makeStep(2, 'Supervisor / Encarregado', 'Liberação da supervisão operacional'),
      makeStep(3, 'Administrador da Empresa', 'Aprovação gerencial da empresa'),
    ];

    return fallback;
  }
}
