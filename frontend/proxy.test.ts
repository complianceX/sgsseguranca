jest.mock("next/server", () => ({
  NextResponse: {
    redirect: (url: URL) => ({
      kind: "redirect",
      url: url.toString(),
    }),
    next: (init?: unknown) => ({
      kind: "next",
      init,
      headers: {
        set: jest.fn(),
      },
    }),
  },
}));

jest.mock("@/lib/route-config", () => ({
  isHiddenRoute: jest.fn(() => false),
}));

import { buildCsp, proxy } from "./proxy";

type ProxyResult = ReturnType<typeof proxy> & {
  kind?: "redirect" | "next";
  url?: string;
};

function makeRequest(pathname: string, cookieNames: string[] = []) {
  const url = `https://app.sgsseguranca.com.br${pathname}`;
  return {
    nextUrl: new URL(url),
    url,
    cookies: {
      has: (name: string) => cookieNames.includes(name),
    },
    headers: new Headers(),
  } as unknown as Parameters<typeof proxy>[0];
}

describe("proxy auth routing", () => {
  it("redireciona dashboard sem refresh_csrf para /login com redirect param", () => {
    const response = proxy(makeRequest("/dashboard")) as ProxyResult;

    expect(response.kind).toBe("redirect");
    expect(response.url).toBe(
      "https://app.sgsseguranca.com.br/login?redirect=%2Fdashboard",
    );
  });

  it("não bloqueia a página de login quando refresh_csrf está stale", () => {
    const response = proxy(makeRequest("/login", ["refresh_csrf"])) as ProxyResult;

    expect(response.kind).toBe("next");
  });

  it("permite dashboard seguir para o bootstrap client-side quando refresh_csrf existe", () => {
    const response = proxy(
      makeRequest("/dashboard", ["refresh_csrf"]),
    ) as ProxyResult;

    expect(response.kind).toBe("next");
  });

  it("mantem unsafe-inline em style-src-elem no CSP de producao", () => {
    const csp = buildCsp("abc123", { isProduction: true });

    expect(csp).toContain(
      "style-src-elem 'self' 'nonce-abc123' 'unsafe-inline'",
    );
  });
});
