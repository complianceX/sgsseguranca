export const AI_RECOVERY_REASON = 'openai_circuit_breaker_open' as const;

export type AiRecoveryJobData = {
  tenantId: string;
  interactionId: string;
  queuedAt?: string;
  reason?: typeof AI_RECOVERY_REASON;
};

export type SanitizedAiRecoveryJobData = {
  data: AiRecoveryJobData;
  changed: boolean;
};

const ALLOWED_KEYS = new Set([
  'tenantId',
  'interactionId',
  'queuedAt',
  'reason',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function sanitizeAiRecoveryJobData(
  value: unknown,
): SanitizedAiRecoveryJobData {
  const source = isRecord(value) ? value : {};
  const tenantId =
    typeof source.tenantId === 'string' ? source.tenantId.trim() : '';
  const interactionId =
    typeof source.interactionId === 'string' ? source.interactionId.trim() : '';
  const queuedAt =
    typeof source.queuedAt === 'string' && source.queuedAt.trim()
      ? source.queuedAt.trim()
      : undefined;
  const reason =
    source.reason === AI_RECOVERY_REASON ? AI_RECOVERY_REASON : undefined;

  const data: AiRecoveryJobData = {
    tenantId,
    interactionId,
    ...(queuedAt ? { queuedAt } : {}),
    ...(reason ? { reason } : {}),
  };

  const sourceKeys = Object.keys(source);
  const hasUnexpectedKey = sourceKeys.some((key) => !ALLOWED_KEYS.has(key));
  const changed =
    hasUnexpectedKey ||
    sourceKeys.length !== Object.keys(data).length ||
    source.tenantId !== tenantId ||
    source.interactionId !== interactionId ||
    source.queuedAt !== queuedAt ||
    source.reason !== reason;

  return { data, changed };
}
