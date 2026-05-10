import { authRefreshHint } from "@/lib/authRefreshHint";
import { selectedTenantStore } from "@/lib/selectedTenantStore";
import { sessionStore, type Session as AuthSession } from "@/lib/sessionStore";
import { tokenStore } from "@/lib/tokenStore";
import { clearSensitiveBrowserStorage } from "@/lib/browser-sensitive-storage";
import type { User } from "@/services/usersService";

export function isAdminGeralAccount(
  session: AuthSession | null | undefined,
): boolean {
  return session?.user?.isAdminGeral === true;
}

export function persistAuthenticatedSession(params: {
  user: User;
  isAdminGeral: boolean;
  roles?: string[];
  accessToken?: string | null;
}) {
  const { accessToken, user, isAdminGeral, roles = [] } = params;

  if (accessToken) {
    tokenStore.set(accessToken);
    authRefreshHint.set();
  }

  const session: AuthSession = {
    userId: user.id,
    user: {
      id: user.id,
      companyId: user.company_id,
      profileName: user.profile?.nome ?? null,
      isAdminGeral,
    },
    companyId: user.company_id,
    profileName: user.profile?.nome ?? null,
    roles,
  };
  sessionStore.set(session);

  const isAdminGeralDetected = isAdminGeralAccount(session);
  if (isAdminGeralDetected) {
    if (user.company_id) {
      selectedTenantStore.set({
        companyId: user.company_id,
        companyName: user.company?.razao_social || "Empresa padrão",
      });
    } else {
      selectedTenantStore.clear();
    }
    return;
  }

  selectedTenantStore.clear();
}

export function clearAuthenticatedSession() {
  clearSensitiveBrowserStorage();
  tokenStore.clear();
  sessionStore.clear();
  authRefreshHint.clear();
  selectedTenantStore.clear();
}
