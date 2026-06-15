import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_ROUTE_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/assinar',
  '/_next',
  '/favicon.ico',
  '/monitoring-tunnel',
  '/api',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_ROUTE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  if (isPublic) {
    return NextResponse.next();
  }

  // Verifica se o cookie refresh_csrf está presente.
  // O cookie refresh_token tem path=/auth/refresh e NÃO é enviado
  // pelo navegador em requisições a /dashboard/*. O refresh_csrf
  // é definido junto com refresh_token no login/refresh, tem path=/,
  // e é limpo no logout — servindo como proxy de sessão para o middleware.
  const hasSession = request.cookies.has('refresh_csrf');

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/proxy/:path*'],
};
