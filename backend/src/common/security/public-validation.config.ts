const parseBoolean = (
  value: string | undefined,
  fallback: boolean,
): boolean => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
};

export function isPublicValidationLegacyCompatEnabled(): boolean {
  return parseBoolean(process.env.PUBLIC_VALIDATION_LEGACY_COMPAT, false);
}

export function isPublicValidationContractLoggingEnabled(): boolean {
  return parseBoolean(process.env.PUBLIC_VALIDATION_LOG_CONTRACT_USAGE, true);
}

const parseInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function getPublicValidationThrottleLimit(): number {
  return parseInteger(process.env.PUBLIC_VALIDATION_THROTTLE_LIMIT, 3);
}

export function getPublicValidationThrottleTtlMs(): number {
  return parseInteger(process.env.PUBLIC_VALIDATION_THROTTLE_TTL_MS, 60_000);
}

export function isPublicValidationBotBlockingEnabled(): boolean {
  return parseBoolean(process.env.PUBLIC_VALIDATION_BLOCK_SUSPICIOUS_UA, false);
}
