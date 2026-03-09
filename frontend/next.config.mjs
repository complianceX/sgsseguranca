/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

function buildCsp() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const connectSrc = [
    "'self'",
    // Em builds Docker no Railway, vars públicas podem não estar disponíveis no build stage.
    // Mantemos fallback explícito + wildcard de domínios Railway para evitar bloqueio por CSP.
    apiUrl || 'https://keen-smile-production.up.railway.app',
    isProd ? 'https://*.up.railway.app' : null,
    // Dev local
    !isProd ? 'http://localhost:3011' : null,
    !isProd ? 'ws://localhost:3000' : null,
    !isProd ? 'ws://localhost:3011' : null,
  ].filter(Boolean);

  // Observação: Next.js injeta alguns scripts/estilos inline em runtime.
  // Mantemos 'unsafe-inline'/'unsafe-eval' para compatibilidade e mitigamos com hardening adicional (removendo token persistente, headers e sanitização).
  // Em um passo futuro, é recomendável migrar para CSP com nonce.
  const directives = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `style-src 'self' 'unsafe-inline'`,
    `script-src 'self' 'unsafe-inline'${!isProd ? " 'unsafe-eval'" : ''}`,
    `connect-src ${connectSrc.join(' ')}`,
    `worker-src 'self'`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
  ];

  return directives.join('; ');
}

const nextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    const csp = buildCsp();
    const headers = [
      {
        key: 'Content-Security-Policy',
        value: csp,
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      },
    ];

    if (isProd) {
      headers.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      });
    }

    return [
      {
        source: '/(.*)',
        headers,
      },
    ];
  },
};

export default nextConfig;
