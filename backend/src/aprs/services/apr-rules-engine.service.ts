import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AprRule, AprRuleSeverity } from '../entities/apr-rule.entity';
import { Apr } from '../entities/apr.entity';
import { AprRiskItem } from '../entities/apr-risk-item.entity';

export interface AprRuleViolation {
  ruleCode: string;
  severity: 'BLOQUEANTE' | 'ADVERTENCIA';
  title: string;
  operationalMessage: string;
  remediation: string;
  nrReference?: string;
}

export interface AprValidationResult {
  isValid: boolean;
  score: number;
  blockers: AprRuleViolation[];
  warnings: AprRuleViolation[];
  appliedRuleSnapshot: string;
}

type TriggerCondition = Record<string, unknown>;

@Injectable()
export class AprRulesEngineService {
  private readonly logger = new Logger(AprRulesEngineService.name);

  constructor(
    @InjectRepository(AprRule)
    private readonly ruleRepo: Repository<AprRule>,
  ) {}

  async validate(apr: Apr): Promise<AprValidationResult> {
    const rules = await this.ruleRepo.find({ where: { isActive: true } });
    const blockers: AprRuleViolation[] = [];
    const warnings: AprRuleViolation[] = [];

    const riskItems: AprRiskItem[] = (apr as unknown as { risk_items?: AprRiskItem[] }).risk_items ?? [];

    for (const rule of rules) {
      try {
        const triggered = this.evaluateTrigger(rule.triggerCondition, apr, riskItems);
        if (triggered) {
          const violation: AprRuleViolation = {
            ruleCode: rule.code,
            severity: rule.severity,
            title: rule.title,
            operationalMessage: rule.operationalMessage,
            remediation: rule.remediation,
            nrReference: rule.nrReference ?? undefined,
          };
          if (rule.severity === AprRuleSeverity.BLOQUEANTE) {
            blockers.push(violation);
          } else {
            warnings.push(violation);
          }
        }
      } catch (err) {
        this.logger.warn(
          `Falha ao avaliar regra ${rule.code}: ${(err as Error).message}`,
        );
      }
    }

    const rawScore = 100 - blockers.length * 20 - warnings.length * 5;
    const score = Math.max(0, rawScore);

    const appliedRuleSnapshot = JSON.stringify(
      rules.map((r) => ({ code: r.code, version: r.version })),
    );

    return {
      isValid: blockers.length === 0,
      score,
      blockers,
      warnings,
      appliedRuleSnapshot,
    };
  }

  private evaluateTrigger(
    condition: TriggerCondition | null,
    apr: Apr,
    riskItems: AprRiskItem[],
  ): boolean {
    if (!condition?.type) return false;

    switch (condition.type as string) {
      case 'NR35_ALTURA':
        return this.evalNr35Altura(condition, apr, riskItems);
      case 'NR10_ELETRICA':
        return this.evalNr10Eletrica(condition, apr, riskItems);
      case 'NR33_CONFINADO':
        return this.evalNr33Confinado(condition, apr, riskItems);
      case 'RISCO_CRITICO_SEM_CONTROLE':
        return this.evalRiscoCritico(condition, riskItems);
      case 'SEM_RESPONSAVEL_TECNICO':
        return this.evalSemResponsavel(apr);
      case 'APR_SEM_RISCO':
        return this.evalSemRisco(riskItems);
      case 'EPI_SEM_CA':
        return this.evalEpiSemCa(riskItems);
      case 'DESCRICAO_RISCO_CURTA':
        return this.evalDescricaoCurta(condition, riskItems);
      default:
        return false;
    }
  }

  private evalNr35Altura(
    cond: TriggerCondition,
    apr: Apr,
    riskItems: AprRiskItem[],
  ): boolean {
    const activityKw = (cond.activityKeywords as string[]) ?? [];
    const riskKw = (cond.riskKeywords as string[]) ?? [];
    const epiKw = (cond.requiredEpiKeywords as string[]) ?? [];
    const epcKw = (cond.requiredEpcKeywords as string[]) ?? [];
    const nrKw = (cond.requiredNrKeyword as string) ?? '';

    const activityMatches = this.keywordsMatchAnyText(activityKw, [
      apr.tipo_atividade ?? '',
      apr.titulo ?? '',
      apr.descricao ?? '',
    ]);
    const riskMatches = this.keywordsMatchRiskItems(riskKw, riskItems);

    if (!activityMatches && !riskMatches) return false;

    const hasEpi = epiKw.some((kw) =>
      riskItems.some((r) => this.containsInsensitive(r.epi ?? '', kw)),
    );
    const hasEpc = epcKw.some((kw) =>
      riskItems.some((r) => this.containsInsensitive(r.epc ?? '', kw)),
    );
    const hasNr = nrKw
      ? riskItems.some((r) =>
          this.containsInsensitive(r.normas_relacionadas ?? '', nrKw),
        )
      : false;

    return !hasEpi && !hasEpc && !hasNr;
  }

  private evalNr10Eletrica(
    cond: TriggerCondition,
    apr: Apr,
    riskItems: AprRiskItem[],
  ): boolean {
    const activityKw = (cond.activityKeywords as string[]) ?? [];
    const riskKw = (cond.riskKeywords as string[]) ?? [];
    const nrKw = (cond.requiredNrKeyword as string) ?? '';

    const activityMatches = this.keywordsMatchAnyText(activityKw, [
      apr.tipo_atividade ?? '',
      apr.titulo ?? '',
      apr.descricao ?? '',
    ]);
    const riskMatches = this.keywordsMatchRiskItems(riskKw, riskItems);

    if (!activityMatches && !riskMatches) return false;

    const hasNr = nrKw
      ? riskItems.some((r) =>
          this.containsInsensitive(r.normas_relacionadas ?? '', nrKw),
        )
      : false;

    return !hasNr;
  }

  private evalNr33Confinado(
    cond: TriggerCondition,
    apr: Apr,
    riskItems: AprRiskItem[],
  ): boolean {
    const activityKw = (cond.activityKeywords as string[]) ?? [];
    const riskKw = (cond.riskKeywords as string[]) ?? [];

    const activityMatches = this.keywordsMatchAnyText(activityKw, [
      apr.tipo_atividade ?? '',
      apr.titulo ?? '',
      apr.descricao ?? '',
    ]);
    const riskMatches = this.keywordsMatchRiskItems(riskKw, riskItems);

    if (!activityMatches && !riskMatches) return false;

    const hasPt = riskItems.some(
      (r) => r.permissao_trabalho && r.permissao_trabalho.trim().length > 0,
    );

    return !hasPt;
  }

  private evalRiscoCritico(
    cond: TriggerCondition,
    riskItems: AprRiskItem[],
  ): boolean {
    const minProb = (cond.minProbabilidade as number) ?? 4;
    const minSev = (cond.minSeveridade as number) ?? 4;

    return riskItems.some((r) => {
      const prob = r.probabilidade ?? 0;
      const sev = r.severidade ?? 0;
      if (prob < minProb || sev < minSev) return false;
      const hasEpc = r.epc && r.epc.trim().length > 0;
      const hasEpi = r.epi && r.epi.trim().length > 0;
      return !hasEpc && !hasEpi;
    });
  }

  private evalSemResponsavel(apr: Apr): boolean {
    const nome = apr.responsavel_tecnico_nome?.trim() ?? '';
    return nome.length === 0;
  }

  private evalSemRisco(riskItems: AprRiskItem[]): boolean {
    return riskItems.length === 0;
  }

  private evalEpiSemCa(riskItems: AprRiskItem[]): boolean {
    return riskItems.some((r) => {
      if (!r.epi || r.epi.trim().length === 0) return false;
      const epiText = r.epi.toLowerCase();
      const hasCa =
        epiText.includes('ca ') ||
        epiText.includes('ca:') ||
        epiText.includes('ca-') ||
        /ca\s*\d{4,}/.test(epiText);
      return !hasCa;
    });
  }

  private evalDescricaoCurta(
    cond: TriggerCondition,
    riskItems: AprRiskItem[],
  ): boolean {
    const minLen = (cond.minLength as number) ?? 20;
    return riskItems.some((r) => {
      const desc = r.condicao_perigosa?.trim() ?? '';
      return desc.length > 0 && desc.length < minLen;
    });
  }

  private keywordsMatchAnyText(keywords: string[], texts: string[]): boolean {
    return keywords.some((kw) =>
      texts.some((t) => this.containsInsensitive(t, kw)),
    );
  }

  private keywordsMatchRiskItems(keywords: string[], riskItems: AprRiskItem[]): boolean {
    const textFields = riskItems.flatMap((r) => [
      r.agente_ambiental ?? '',
      r.condicao_perigosa ?? '',
      r.fonte_circunstancia ?? '',
      r.lesao ?? '',
      r.atividade ?? '',
    ]);
    return keywords.some((kw) =>
      textFields.some((t) => this.containsInsensitive(t, kw)),
    );
  }

  private containsInsensitive(text: string, keyword: string): boolean {
    return text.toLowerCase().includes(keyword.toLowerCase());
  }
}
