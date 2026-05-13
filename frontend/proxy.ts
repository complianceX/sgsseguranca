import { NextRequest, NextResponse } from "next/server";
import { isHiddenRoute } from "@/lib/route-config";

const isProduction = process.env.NODE_ENV === "production";

// Cookie definido pelo backend com path '/' — presente enquanto sessao está ativa.
const REFRESH_CSRF_COOKIE = "refresh_csrf";

function isDashboardRoute(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

function buildCsp(nonce: string): string {
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL?.trim();
  const apiWsOrigin = apiOrigin?.replace(/^https?:\/\//, (match) => {
    const isHttps = match === "https://";
    const scheme = isHttps ? "wss" : "ws";
    return `${scheme}://`;
  });
  const connectSrc = [
    "'self'",
    apiOrigin,
    apiWsOrigin,
    !isProduction ? "http://localhost:3011" : null,
    !isProduction ? `${"ws"}://${"localhost"}:3000` : null,
    !isProduction ? `${"ws"}://${"localhost"}:3011` : null,
    "https://*.sentry.io",
    "https://challenges.cloudflare.com",
    "https://*.r2.cloudflarestorage.com",
    "https://api.elevenlabs.io",
    "wss://api.elevenlabs.io",
  ].filter(Boolean);

  // Nonce por requisição para scripts. Em estilos, React e alguns widgets
  // aplicam style="" em runtime; CSP nonce nao cobre atributos style.
  // Em desenvolvimento, o React Refresh do Next usa eval para HMR. Em produção,
  // 'unsafe-eval' permanece bloqueado.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    !isProduction ? "'unsafe-eval'" : null,
    "https://challenges.cloudflare.com",
  ].filter(Boolean);

  const styleSrc = ["'self'", "'unsafe-inline'"].filter(Boolean);

  const directives = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `img-src 'self' data: blob: https://*.r2.cloudflarestorage.com`,
    `font-src 'self' data:`,
    `style-src ${styleSrc.join(" ")}`,
    `script-src ${scriptSrc.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    `frame-src 'self' https://challenges.cloudflare.com`,
    `media-src 'self' blob: data: ${[apiOrigin, "https://*.r2.cloudflarestorage.com", "https://api.elevenlabs.io"].filter(Boolean).join(" ")}`,
    `worker-src 'self' blob:`,
    `form-action 'self'`,
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isHiddenRoute(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Redireciona para login se acessar dashboard sem sessao ativa.
  // O cookie refresh_csrf (path=/,não-httpOnly) é emitido pelo backend no login
  // e limpo no logout — serve como sinal confiável de sessão sem expor o refresh token.
  if (isDashboardRoute(pathname) && !request.cookies.has(REFRESH_CSRF_COOKIE)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("expired", "1");
    return NextResponse.redirect(loginUrl);
  }

  const random = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...random));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
