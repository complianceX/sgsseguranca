import { authRefreshHint } from '@/lib/authRefreshHint';
import { selectedTenantStore } from '@/lib/selectedTenantStore';
import { sessionStore } from '@/lib/sessionStore';
import { tokenStore } from '@/lib/tokenStore';
import type { User } from '@/services/usersService';

function normalizeRoleToken(value?: string | null): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isAdminGeralAccount(
  profileName?: string | null,
  roleNames: string[] = [],
): boolean {
  const adminTokens = new Set(['administradorgeral', 'admingeral']);

  const normalizedProfile = normalizeRoleToken(profileName);
  if (adminTokens.has(normalizedProfile)) {
    return true;
  }

  return roleNames.some((role) => adminTokens.has(normalizeRoleToken(role)));
}

export function persistAuthenticatedSession(params: {
  user: User;
  roles?: string[];
  accessToken?: string | null;
}) {
  const { accessToken, user, roles = [] } = params;

  if (accessToken) {
    tokenStore.set(accessToken);
    authRefreshHint.set();
  }

  sessionStore.set({
    userId: user.id,
    companyId: user.company_id,
    profileName: user.profile?.nome ?? null,
    roles,
  });

  const isAdminGeralDetected = isAdminGeralAccount(user.profile?.nome, roles);
  if (isAdminGeralDetected) {
    if (user.company_id) {
      selectedTenantStore.set({
        companyId: user.company_id,
        companyName: user.company?.razao_social || 'Empresa padrão',
      });
    } else {
      selectedTenantStore.clear();
    }
    return;
  }

  selectedTenantStore.clear();
}

export function clearAuthenticatedSession() {
  tokenStore.clear();
  sessionStore.clear();
  authRefreshHint.clear();
  selectedTenantStore.clear();
}
