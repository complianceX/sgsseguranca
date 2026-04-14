import { NextRequest, NextResponse } from 'next/server';

const isProduction = process.env.NODE_ENV === 'production';
const CANONICAL_API_ORIGIN = 'https://api.sgsseguranca.com.br';
const CANONICAL_API_WS_ORIGIN = 'wss://api.sgsseguranca.com.br';

function buildCsp(nonce: string): string {
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL?.trim();
  const connectSrc = [
    "'self'",
    CANONICAL_API_ORIGIN,
    CANONICAL_API_WS_ORIGIN,
    apiOrigin,
    !isProduction ? 'http://localhost:3011' : null,
    !isProduction ? 'ws://localhost:3000' : null,
    !isProduction ? 'ws://localhost:3011' : null,
    'https://*.sentry.io',
    'https://challenges.cloudflare.com',
    'https://*.r2.cloudflarestorage.com',
    'https://api.elevenlabs.io',
    'wss://api.elevenlabs.io',
  ].filter(Boolean);

  const directives = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `style-src 'self' 'unsafe-inline'`,
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    `connect-src ${connectSrc.join(' ')}`,
    `frame-src 'self' https://challenges.cloudflare.com`,
    `media-src 'self' blob: data: https:`,
    `worker-src 'self' blob:`,
    `form-action 'self'`,
    'upgrade-insecure-requests',
  ];

  return directives.join('; ');
}

export function middleware(request: NextRequest) {
  const random = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...random));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set('x-nonce', nonce);
  response.headers.set('Content-Security-Policy', buildCsp(nonce));
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
