export function isAiEnabled(): boolean {
  // Default OFF: evita chamadas acidentais em produção sem IA.
  return (process.env.NEXT_PUBLIC_FEATURE_AI_ENABLED || '').trim().toLowerCase() === 'true';
}

export function isSophieAutomationPhase1Enabled(): boolean {
  // Default ON: habilita automação assistida da SOPHIE, podendo desligar por env se necessário.
  const raw = (process.env.NEXT_PUBLIC_SOPHIE_AUTOMATION_PHASE1_ENABLED || 'true')
    .trim()
    .toLowerCase();
  return raw !== 'false';
}
