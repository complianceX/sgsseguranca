import { NextRequest, NextResponse } from 'next/server';

const isProduction = process.env.NODE_ENV === 'production';

function buildCsp(nonce: string): string {
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL?.trim();
  const apiWsOrigin = apiOrigin?.replace(/^https?:\/\//, (match) =>
    match === 'https://' ? 'wss://' : 'ws://',
  );
  const connectSrc = [
    "'self'",
    apiOrigin,
    apiWsOrigin,
    !isProduction ? 'http://localhost:3011' : null,
    !isProduction ? 'ws://localhost:3000' : null,
    !isProduction ? 'ws://localhost:3011' : null,
    'https://*.sentry.io',
    'https://challenges.cloudflare.com',
    'https://*.r2.cloudflarestorage.com',
    'https://api.elevenlabs.io',
    'wss://api.elevenlabs.io',
  ].filter(Boolean);

  // Nonce por requisição — permite scripts e estilos inline legítimos sem
  // 'unsafe-inline'. Cada request tem nonce único gerado via crypto.getRandomValues.
  // Em desenvolvimento, o React Refresh do Next usa eval para HMR. Em produção,
  // 'unsafe-eval' permanece bloqueado.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    !isProduction ? "'unsafe-eval'" : null,
    'https://challenges.cloudflare.com',
  ].filter(Boolean);

  const styleSrc = [
    "'self'",
    isProduction ? `'nonce-${nonce}'` : "'unsafe-inline'",
  ].filter(Boolean);

  const directives = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.supabase.co`,
    `font-src 'self' data:`,
    `style-src ${styleSrc.join(' ')}`,
    `script-src ${scriptSrc.join(' ')}`,
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
