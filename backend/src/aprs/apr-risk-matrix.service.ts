import { Injectable } from '@nestjs/common';

export type AprRiskCategory =
  | 'Aceitável'
  | 'Atenção'
  | 'Substancial'
  | 'Crítico';

export type AprRiskPriority =
  | 'Não prioritário'
  | 'Prioridade básica'
  | 'Prioridade preferencial'
  | 'Prioridade máxima';

export interface AprRiskEvaluation {
  score: number | null;
  categoria: AprRiskCategory | null;
  prioridade: AprRiskPriority | null;
}

type AprRiskRule = {
  category: AprRiskCategory;
  scores: number[];
  priority: AprRiskPriority;
  description: string;
};

export const APR_RISK_RULES: AprRiskRule[] = [
  {
    category: 'Aceitável',
    scores: [1, 2],
    priority: 'Não prioritário',
    description:
      'Não são requeridos controles adicionais. Condição dentro dos parâmetros.',
  },
  {
    category: 'Atenção',
    scores: [3, 4],
    priority: 'Prioridade básica',
    description:
      'Reavaliar periodicamente e adotar medidas complementares quando necessário.',
  },
  {
    category: 'Substancial',
    scores: [6],
    priority: 'Prioridade preferencial',
    description:
      'Trabalho não deve ser iniciado ou continuado sem redução de risco e controles eficazes.',
  },
  {
    category: 'Crítico',
    scores: [9],
    priority: 'Prioridade máxima',
    description:
      'Interromper o processo e implementar ações imediatas antes da execução.',
  },
];

export type AprRiskSummary = {
  total: number;
  aceitavel: number;
  atencao: number;
  substancial: number;
  critico: number;
};

@Injectable()
export class AprRiskMatrixService {
  private readonly normalizedCategoryMap = new Map<string, AprRiskCategory>([
    ['ACEITAVEL', 'Aceitável'],
    ['ACEITÁVEL', 'Aceitável'],
    ['ATENCAO', 'Atenção'],
    ['ATENÇÃO', 'Atenção'],
    ['DE ATENCAO', 'Atenção'],
    ['DE ATENÇÃO', 'Atenção'],
    ['SUBSTANCIAL', 'Substancial'],
    ['CRITICO', 'Crítico'],
    ['CRÍTICO', 'Crítico'],
  ]);

  getRules() {
    return APR_RISK_RULES.map((rule) => ({
      category: rule.category,
      scores: [...rule.scores],
      priority: rule.priority,
      description: rule.description,
    }));
  }

  normalizeCategory(value: string | null | undefined): AprRiskCategory | null {
    if (!value) {
      return null;
    }

    const normalized = value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .toUpperCase();

    return this.normalizedCategoryMap.get(normalized) ?? null;
  }

  getPriorityForCategory(
    category: AprRiskCategory | null | undefined,
  ): AprRiskPriority | null {
    const rule = APR_RISK_RULES.find((entry) => entry.category === category);
    return rule?.priority ?? null;
  }

  evaluate(
    probability?: number | null,
    severity?: number | null,
  ): AprRiskEvaluation {
    if (
      probability === null ||
      probability === undefined ||
      severity === null ||
      severity === undefined
    ) {
      return {
        score: null,
        categoria: null,
        prioridade: null,
      };
    }

    const sanitizedProbability = Math.max(0, Number(probability));
    const sanitizedSeverity = Math.max(0, Number(severity));

    if (!sanitizedProbability || !sanitizedSeverity) {
      return {
        score: null,
        categoria: null,
        prioridade: null,
      };
    }

    const score = sanitizedProbability * sanitizedSeverity;
    const rule = APR_RISK_RULES.find((entry) => entry.scores.includes(score));

    return {
      score,
      categoria: rule?.category ?? null,
      prioridade: rule?.priority ?? null,
    };
  }

  summarize(
    categories: Array<AprRiskCategory | null | undefined>,
  ): AprRiskSummary {
    const summary: AprRiskSummary = {
      total: 0,
      aceitavel: 0,
      atencao: 0,
      substancial: 0,
      critico: 0,
    };

    categories.forEach((category) => {
      if (!category) {
        return;
      }

      summary.total += 1;
      if (category === 'Aceitável') summary.aceitavel += 1;
      if (category === 'Atenção') summary.atencao += 1;
      if (category === 'Substancial') summary.substancial += 1;
      if (category === 'Crítico') summary.critico += 1;
    });

    return summary;
  }
}
