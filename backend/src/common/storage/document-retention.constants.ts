export const DEFAULT_RETENTION_DAYS = {
  apr: 1825, // 5 anos
  dds: 730, // 2 anos
  pt: 1825, // 5 anos
  fallback: 1825, // padrão para módulos sem regra dedicada
} as const;

export type TenantRetentionPolicyColumn =
  | 'retention_days_apr'
  | 'retention_days_dds'
  | 'retention_days_pts';

export function resolveRetentionColumnForModule(
  moduleName: string,
): TenantRetentionPolicyColumn | null {
  switch (moduleName) {
    case 'apr':
      return 'retention_days_apr';
    case 'dds':
      return 'retention_days_dds';
    case 'pt':
      return 'retention_days_pts';
    default:
      return null;
  }
}

export function resolveDefaultRetentionDaysForModule(
  moduleName: string,
): number {
  switch (moduleName) {
    case 'apr':
      return DEFAULT_RETENTION_DAYS.apr;
    case 'dds':
      return DEFAULT_RETENTION_DAYS.dds;
    case 'pt':
      return DEFAULT_RETENTION_DAYS.pt;
    default:
      return DEFAULT_RETENTION_DAYS.fallback;
  }
}
