import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuthState } from "@/context/AuthContext";
import { authService } from "@/services/authService";
import { authRefreshHint } from "@/lib/authRefreshHint";
import { sessionStore } from "@/lib/sessionStore";
import { tokenStore } from "@/lib/tokenStore";
import type { User } from "@/services/usersService";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock("@/services/authService", () => ({
  authService: {
    getCsrfToken: jest.fn(),
    refreshAccessToken: jest.fn(),
    getCurrentSession: jest.fn(),
    logout: jest.fn(),
    login: jest.fn(),
  },
}));

const user: User = {
  id: "user-1",
  nome: "Operador SGS",
  email: "operador@sgs.local",
  cpf: "12345678900",
  role: "operador",
  company_id: "company-1",
  profile_id: "profile-1",
  profile: {
    id: "profile-1",
    nome: "Operador",
    permissoes: [],
  },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function clearCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; path=/`;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/`;
}

function AuthProbe() {
  const { loading, user: currentUser } = useAuthState();

  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{currentUser?.id ?? "none"}</span>
    </div>
  );
}

describe("AuthProvider bootstrap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authRefreshHint.clear();
    sessionStore.clear();
    tokenStore.clear();
    clearCookie("refresh_csrf");

    (authService.getCsrfToken as jest.Mock).mockResolvedValue(undefined);
    (authService.refreshAccessToken as jest.Mock).mockResolvedValue({
      accessToken: "access-token-1",
    });
    (authService.getCurrentSession as jest.Mock).mockResolvedValue({
      user,
      roles: ["operador"],
      permissions: ["can_view_dashboard"],
      isAdminGeral: false,
    });
  });

  afterEach(() => {
    clearCookie("refresh_csrf");
  });

  it("renova sessão com refresh_csrf mesmo sem hint local", async () => {
    setCookie("refresh_csrf", "refresh-csrf-token");

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );

    expect(authRefreshHint.get()).toBe(false);
    expect(authService.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(authService.getCurrentSession).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("user")).toHaveTextContent("user-1");
    expect(tokenStore.get()).toBe("access-token-1");
  });

  it("não tenta refresh quando não existe refresh_csrf", async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );

    expect(authService.refreshAccessToken).not.toHaveBeenCalled();
    expect(authService.getCurrentSession).not.toHaveBeenCalled();
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });
});
