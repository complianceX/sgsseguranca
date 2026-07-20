import type { DashboardPendingQueueResponse } from '@/services/dashboardService';

export function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function resolveComplianceLabel(score: number | null): string {
  if (score == null) return 'Calculando';
  if (score >= 85) return 'Excelente';
  if (score >= 70) return 'Controlado';
  if (score >= 50) return 'Atenção';
  return 'Crítico';
}

export function resolveComplianceMessage(score: number | null): string {
  if (score == null) return 'Consolidando dados de conformidade.';
  if (score >= 85) return 'Excelente aderência operacional. Mantenha o ritmo.';
  if (score >= 70) return 'Pequenos ajustes elevarão o desempenho.';
  if (score >= 50) return 'Priorize regularizações para reduzir exposição.';
  return 'Plano de ação imediato recomendado.';
}

export interface CalcComplianceScoreInput {
  loading: boolean;
  pendingSummary: DashboardPendingQueueResponse['summary'];
  expiredEpisCount: number;
  expiredTrainingsCount: number;
  includeEpiPenalty: boolean;
  includeTrainingPenalty: boolean;
}

export function calcComplianceScore(input: CalcComplianceScoreInput): number | null {
  if (input.loading) return null;
  const criticalPenalty = Math.min(40, input.pendingSummary.critical * 8);
  const highPenalty = Math.min(18, input.pendingSummary.high * 2.5);
  const totalPenalty = Math.min(14, Math.max(0, input.pendingSummary.total - 5) * 1.2);
  const epiPenalty = input.includeEpiPenalty ? Math.min(14, input.expiredEpisCount * 3.5) : 0;
  const trainingPenalty = input.includeTrainingPenalty
    ? Math.min(14, input.expiredTrainingsCount * 3.5)
    : 0;
  return clampScore(
    100 - criticalPenalty - highPenalty - totalPenalty - epiPenalty - trainingPenalty,
  );
}
