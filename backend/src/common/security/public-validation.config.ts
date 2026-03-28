const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
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
