import { isAdminGeralAccount } from "./auth-session-state";

describe("auth-session-state", () => {
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
});
