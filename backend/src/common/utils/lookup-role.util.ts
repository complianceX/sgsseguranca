import { Role } from '../../auth/enums/roles.enum';

export type LookupRole = 'admin' | 'manager' | 'user';

function normalizeProfileName(profileName?: string | null): string {
  return String(profileName || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

export function resolveLookupRole(profileName?: string | null): LookupRole {
  const normalized = normalizeProfileName(profileName);

  if (
    normalized === normalizeProfileName(Role.ADMIN_GERAL) ||
    normalized === normalizeProfileName(Role.ADMIN_EMPRESA)
  ) {
    return 'admin';
  }

  if (
    normalized === normalizeProfileName(Role.TST) ||
    normalized === normalizeProfileName(Role.SUPERVISOR)
  ) {
    return 'manager';
  }

  return 'user';
}
