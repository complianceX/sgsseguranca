import { Injectable } from '@nestjs/common';

/**
 * Matriz de risco 5×5 (Probabilidade × Severidade)
 *
 * Compatível com ISO 31000, ABNT NBR ISO 45001 e práticas do mercado
 * brasileiro (mineração, usinas, manutenção industrial, campo).
 *
 * Escala de Probabilidade (1–5):
 *   1 = Improvável      — ocorrência raramente esperada
 *   2 = Remota          — pode ocorrer em situações excepcionais
 *   3 = Ocasional       — pode ocorrer em algum momento
 *   4 = Provável        — provavelmente ocorrerá em algum momento
 *   5 = Frequente       — esperado que ocorra repetidamente
 *
 * Escala de Severidade (1–5):
 *   1 = Insignificante  — sem lesão ou dano desprezível
 *   2 = Menor           — lesão leve, primeiros socorros
 *   3 = Moderada        — lesão com afastamento, dano reversível
 *   4 = Grave           — lesão grave permanente, incapacidade parcial
 *   5 = Catastrófica    — morte, incapacidade total, múltiplas vítimas
 *
 * Score = P × S (1–25):
 *   1–4   = Aceitável    (verde)
 *   5–9   = Atenção      (amarelo)
 *   10–16 = Substancial  (laranja)
 *   17–25 = Crítico      (vermelho)
 *
 * Retrocompatibilidade com escala 3×3 (scores 1–9):
 *   Scores recebidos da escala antiga são remapeados corretamente pela
 *   lógica de faixas, sem quebrar registros existentes.
 */

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

type AprRiskBand = {
  category: AprRiskCategory;
  minScore: number;
  maxScore: number;
  priority: AprRiskPriority;
  color: string;
  description: string;
};

/** Bandas de classificação para a matriz 5×5 (scores 1–25). */
export const APR_RISK_BANDS: AprRiskBand[] = [
  {
    category: 'Aceitável',
    minScore: 1,
    maxScore: 4,
    priority: 'Não prioritário',
    color: '#22c55e',
    description:
      'Não são requeridos controles adicionais. Condição dentro dos parâmetros aceitáveis. Monitorar periodicamente.',
  },
  {
    category: 'Atenção',
    minScore: 5,
    maxScore: 9,
    priority: 'Prioridade básica',
    color: '#eab308',
    description:
      'Reavaliar periodicamente e adotar medidas complementares quando necessário. Documentar justificativa de aceitação.',
  },
  {
    category: 'Substancial',
    minScore: 10,
    maxScore: 16,
    priority: 'Prioridade preferencial',
    color: '#f97316',
    description:
      'Trabalho não deve ser iniciado ou continuado sem redução de risco. Implementar controles eficazes antes da execução.',
  },
  {
    category: 'Crítico',
    minScore: 17,
    maxScore: 25,
    priority: 'Prioridade máxima',
    color: '#ef4444',
    description:
      'Interromper o processo imediatamente. Implementar ações emergenciais antes de qualquer execução. Escalar para gestão.',
  },
];

/**
 * Labels descritivos para cada nível de probabilidade (escala 1–5).
 */
export const APR_PROBABILITY_LABELS: Record<number, string> = {
  1: 'Improvável',
  2: 'Remota',
  3: 'Ocasional',
  4: 'Provável',
  5: 'Frequente',
};

/**
 * Labels descritivos para cada nível de severidade (escala 1–5).
 */
export const APR_SEVERITY_LABELS: Record<number, string> = {
  1: 'Insignificante',
  2: 'Menor',
  3: 'Moderada',
  4: 'Grave',
  5: 'Catastrófica',
};

/**
 * Mapeamento retrocompatível de scores da escala 3×3 (1–9) para a 5×5.
 * Permite que APRs antigas continuem classificando corretamente.
 * Score 3×3:  1  2  3  4  6  9
 * Score 5×5:  1  2  3  4  6  9  (faixas se sobrepõem — Aceitável≤4, Atenção 5–9)
 */
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

  getBands(): AprRiskBand[] {
    return APR_RISK_BANDS.map((band) => ({ ...band }));
  }

  /** @deprecated Use getBands() — retorna regras da nova matriz 5×5. */
  getRules() {
    return APR_RISK_BANDS.map((band) => ({
      category: band.category,
      scores: Array.from(
        { length: band.maxScore - band.minScore + 1 },
        (_, i) => band.minScore + i,
      ),
      priority: band.priority,
      description: band.description,
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
    const band = APR_RISK_BANDS.find((b) => b.category === category);
    return band?.priority ?? null;
  }

  getCategoryForScore(score: number | null | undefined): AprRiskCategory | null {
    if (score === null || score === undefined || score <= 0) {
      return null;
    }
    const band = APR_RISK_BANDS.find(
      (b) => score >= b.minScore && score <= b.maxScore,
    );
    return band?.category ?? null;
  }

  /**
   * Avalia um par (probabilidade, severidade) e retorna score, categoria e prioridade.
   * Aceita escala 1–5 (nova) ou 1–3 (legado retrocompatível).
   */
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
      return { score: null, categoria: null, prioridade: null };
    }

    const p = Math.max(1, Math.min(5, Math.round(Number(probability))));
    const s = Math.max(1, Math.min(5, Math.round(Number(severity))));

    if (!p || !s) {
      return { score: null, categoria: null, prioridade: null };
    }

    const score = p * s;
    const categoria = this.getCategoryForScore(score);
    const prioridade = this.getPriorityForCategory(categoria);

    return { score, categoria, prioridade };
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

    for (const category of categories) {
      if (!category) continue;
      summary.total += 1;
      if (category === 'Aceitável') summary.aceitavel += 1;
      if (category === 'Atenção') summary.atencao += 1;
      if (category === 'Substancial') summary.substancial += 1;
      if (category === 'Crítico') summary.critico += 1;
    }

    return summary;
  }
}
