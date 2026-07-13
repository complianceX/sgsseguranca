export function isAiEnabled(): boolean {
  // BLOQUEADO: default OFF até haver instrumento contratual e salvaguardas válidas
  // para o provedor externo de IA (LGPD Art. 7 e transferência internacional).
  // Ativar explicitamente via env:
  // NEXT_PUBLIC_FEATURE_AI_ENABLED=true
  const raw = (process.env.NEXT_PUBLIC_FEATURE_AI_ENABLED || 'false')
    .trim()
    .toLowerCase();
  return raw === 'true';
}

export function isSophieAutomationPhase1Enabled(): boolean {
  // BLOQUEADO: default OFF junto com isAiEnabled().
  const raw = (process.env.NEXT_PUBLIC_SOPHIE_AUTOMATION_PHASE1_ENABLED || 'false')
    .trim()
    .toLowerCase();
  return raw === 'true';
}

export function isAprAnalyticsEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_APR_ANALYTICS_ENABLED || 'false')
    .trim()
    .toLowerCase();
  return raw === 'true';
}
