export function isAiEnabled(): boolean {
  // Default OFF: evita chamadas acidentais em produção sem IA.
  return (process.env.NEXT_PUBLIC_FEATURE_AI_ENABLED || '').trim().toLowerCase() === 'true';
}

