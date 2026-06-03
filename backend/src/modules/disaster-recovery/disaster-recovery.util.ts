import {
  DISASTER_RECOVERY_DEFAULT_RPO_HOURS,
  DISASTER_RECOVERY_DEFAULT_RTO_HOURS,
  DISASTER_RECOVERY_PRODUCTION_CONFIRMATION_TOKEN,
} from './disaster-recovery.constants';

export function resolveDisasterRecoveryEnvironment(
  input?: string | null,
  nodeEnv?: string | null,
): string {
  const candidate = (input || nodeEnv || 'development').trim();
  return candidate.length > 0 ? candidate : 'development';
}

export function resolveRuntimeNodeEnvironment(
  input?: string | null,
  fallback?: string | null,
): 'development' | 'production' | 'test' | 'staging' {
  const candidate = (input || fallback || 'development').trim().toLowerCase();

  if (
    candidate === 'development' ||
    candidate === 'production' ||
    candidate === 'test' ||
    candidate === 'staging'
  ) {
    return candidate;
  }

  if (
    candidate === 'recovery' ||
    candidate === 'sandbox' ||
    candidate === 'homologation' ||
    candidate === 'homologacao'
  ) {
    return 'staging';
  }

  return 'development';
}

export function sanitizeBackupLabel(label?: string | null): string | null {
  const normalized = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return normalized.length > 0 ? normalized : null;
}

export function buildDisasterRecoveryTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function buildBackupArtifactName(input: {
  environment: string;
  label?: string | null;
  timestamp?: string;
}): string {
  const parts = ['db-backup', input.environment.trim()];
  const label = sanitizeBackupLabel(input.label);
  if (label) {
    parts.push(label);
  }
  parts.push(input.timestamp || buildDisasterRecoveryTimestamp());
  return parts.join('__');
}

export function resolveRetentionDays(value?: string | number | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 30;
  }
  return Math.floor(parsed);
}

export function resolveRpoHours(value?: string | number | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DISASTER_RECOVERY_DEFAULT_RPO_HOURS;
  }
  return Math.floor(parsed);
}

export function resolveRtoHours(value?: string | number | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DISASTER_RECOVERY_DEFAULT_RTO_HOURS;
  }
  return Math.floor(parsed);
}

export function assertSafeRestoreExecution(input: {
  execute: boolean;
  targetEnvironment: string;
  allowProductionRestore: boolean;
  confirmationToken?: string | null;
}): void {
  if (!input.execute) {
    return;
  }

  if (input.targetEnvironment !== 'production') {
    return;
  }

  if (
    input.allowProductionRestore &&
    input.confirmationToken === DISASTER_RECOVERY_PRODUCTION_CONFIRMATION_TOKEN
  ) {
    return;
  }

  throw new Error(
    'Restore em produção bloqueado. Use allowProductionRestore + token de confirmação explícito.',
  );
}

export function assertSafeSeparateEnvironmentRecovery(input: {
  execute: boolean;
  sourceEnvironment: string;
  targetEnvironment: string;
  allowSameEnvironment?: boolean;
}): void {
  if (!input.execute) {
    return;
  }

  if (input.allowSameEnvironment) {
    return;
  }

  if (input.sourceEnvironment !== input.targetEnvironment) {
    return;
  }

  throw new Error(
    'Recovery validation real exige ambiente alvo separado. Use targetEnvironment diferente do ambiente de origem ou libere explicitamente allowSameEnvironment.',
  );
}
