import {
  isAdminGeralAccount,
  persistAuthenticatedSession,
} from "./auth-session-state";
import { selectedTenantStore } from "./selectedTenantStore";
import { sessionStore } from "./sessionStore";

const adminGeneralUser = {
  id: "user-1",
  nome: "Administrador Geral",
  email: "admin@sgs.local",
  cpf: "00000000000",
  role: "ADMIN_GERAL",
  company_id: "company-1",
  profile_id: "profile-admin",
  profile: {
    id: "profile-admin",
    nome: "Administrador Geral",
    permissoes: [],
  },
  company: {
    id: "company-1",
    razao_social: "Empresa Base",
  },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("auth-session-state", () => {
  beforeEach(() => {
    sessionStore.clear();
    selectedTenantStore.clear();
  });

  it("reconhece admin geral por flag explicita", () => {
    expect(
      isAdminGeralAccount({
        userId: "user-1",
        user: { id: "user-1", isAdminGeral: true },
      }),
    ).toBe(true);
  });

  it("reconhece admin geral por variacoes de perfil e role", () => {
    expect(
      isAdminGeralAccount({
        userId: "user-1",
        user: {
          id: "user-1",
          isAdminGeral: false,
          profileName: "ADMIN_GERAL",
        },
      }),
    ).toBe(true);

    expect(
      isAdminGeralAccount({
        userId: "user-1",
        profileName: "admin geral",
        user: { id: "user-1", isAdminGeral: false },
      }),
    ).toBe(true);

    expect(
      isAdminGeralAccount({
        userId: "user-1",
        roles: ["Administrador Geral"],
        user: { id: "user-1", isAdminGeral: false },
      }),
    ).toBe(true);
  });

  it("nao classifica usuario tenant-scoped como admin geral", () => {
    expect(
      isAdminGeralAccount({
        userId: "user-1",
        roles: ["Administrador da Empresa"],
        profileName: "Administrador da Empresa",
        user: { id: "user-1", isAdminGeral: false },
      }),
    ).toBe(false);
  });

  it("nao fixa tenant padrao ao autenticar admin geral", () => {
    selectedTenantStore.set({
      companyId: "company-stale",
      companyName: "Empresa antiga",
    });

    persistAuthenticatedSession({
      user: adminGeneralUser,
      isAdminGeral: true,
      roles: ["ADMIN_GERAL"],
    });

    expect(selectedTenantStore.get()).toBeNull();
    expect(sessionStore.get()?.user?.isAdminGeral).toBe(true);
    expect(sessionStore.get()?.companyId).toBe("company-1");
  });
});
