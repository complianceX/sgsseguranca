export function isAiEnabled(): boolean {
  // Default ON: a SOPHIE deve ser parte visível do produto e só some quando
  // houver desligamento explícito do frontend.
  const raw = (process.env.NEXT_PUBLIC_FEATURE_AI_ENABLED || 'true')
    .trim()
    .toLowerCase();
  return raw !== 'false';
}

export function isSophieAutomationPhase1Enabled(): boolean {
  // Default ON: habilita automação assistida da SOPHIE, podendo desligar por env se necessário.
  const raw = (process.env.NEXT_PUBLIC_SOPHIE_AUTOMATION_PHASE1_ENABLED || 'true')
    .trim()
    .toLowerCase();
  return raw !== 'false';
}
