import { readFrontendEnvironment } from './scripts/public-env.mjs';
import { execSync } from 'node:child_process';
import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const frontendEnv = readFrontendEnvironment({
  requireExplicitApiUrl: isProd,
  requireExplicitAppUrl: isProd,
});

function resolveGitBuildId() {
  try {
    const sha = execSync('git rev-parse --short=12 HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: process.cwd(),
    })
      .toString()
      .trim();

    if (!sha) {
      return null;
    }

    const dirty = execSync('git status --porcelain', {
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: process.cwd(),
    })
      .toString()
      .trim();

    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return null;
  }
}

const gitBuildId = resolveGitBuildId();
const timestampBuildId = `build-${new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, '')
  .slice(0, 14)}`;
const resolvedBuildId = [
  process.env.NEXT_PUBLIC_BUILD_ID,
  process.env.RAILWAY_GIT_COMMIT_SHA,
  process.env.RAILWAY_DEPLOYMENT_ID,
  process.env.GITHUB_SHA,
  process.env.VERCEL_GIT_COMMIT_SHA,
  gitBuildId,
  timestampBuildId,
  process.env.npm_package_version,
  'local-dev',
]
  .find((value) => typeof value === 'string' && value.trim().length > 0)
  ?.trim()
  .replace(/[^a-zA-Z0-9._-]/g, '-')
  .slice(0, 32);
const serviceWorkerBuildId = resolvedBuildId || 'local-dev';
const hasSentryAuthToken = Boolean(process.env.SENTRY_AUTH_TOKEN?.trim());

function buildCsp() {
  const connectSrc = new Set([
    "'self'",
    frontendEnv.apiOrigin,
    frontendEnv.apiWebSocketOrigin,
    // Dev local
    !isProd ? 'http://localhost:3011' : null,
    !isProd ? 'ws://localhost:3000' : null,
    !isProd ? 'ws://localhost:3011' : null,
    'https://api.elevenlabs.io',
    'wss://api.elevenlabs.io',
    // Sentry session replay upload (tunnelRoute cobre event reporting)
    'https://*.sentry.io',
    'https://challenges.cloudflare.com',
  ].filter(Boolean));
  // Em produção usamos allowlist explícita + inline controlado.
  // O app usa App Router e bootstrap inline do Next.js; sem nonce por request,
  // `strict-dynamic` bloqueia os próprios bundles e deixa a tela branca.
  // Em dev, unsafe-eval continua necessário para HMR/fast-refresh.
  const scriptSrc = isProd
    ? [
        "'self'",
        "'unsafe-inline'",
        'https://unpkg.com',
        'https://challenges.cloudflare.com',
      ]
    : [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        'https://unpkg.com',
        'https://challenges.cloudflare.com',
      ];
  const scriptSrcStr = scriptSrc.join(' ');
  const directives = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `style-src 'self' 'unsafe-inline'`,
    `script-src ${scriptSrcStr}`,
    `connect-src ${Array.from(connectSrc).join(' ')}`,
    `frame-src 'self' https://challenges.cloudflare.com`,
    `media-src 'self' blob: data: https:`,
    `worker-src 'self' blob:`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
  ];

  return directives.join('; ');
}

const nextConfig = {
  generateBuildId: async () => serviceWorkerBuildId,
  env: {
    NEXT_PUBLIC_BUILD_ID: serviceWorkerBuildId,
  },
  webpack(config) {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /@opentelemetry\/instrumentation/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ];

    return config;
  },
  turbopack: {
    root: process.cwd(),
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
        value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()',
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

// ---------------------------------------------------------------------------
// Sentry webpack plugin — wraps nextConfig unconditionally so que os hooks
// de build (source maps, tunnel route) funcionem quando DSN estiver presente.
// Source maps são enviados ao Sentry mas NÃO servidos publicamente (hideSourceMaps).
// ---------------------------------------------------------------------------

export default withSentryConfig(nextConfig, {
  ...(hasSentryAuthToken
    ? {
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
      }
    : {}),
  // Cria /monitoring-tunnel API route para proxiar eventos ao Sentry.
  // Evita bloqueio por CSP e ad-blockers sem adicionar domínio externo no connect-src.
  tunnelRoute: '/monitoring-tunnel',

  // Source maps: enviados ao Sentry no build, não incluídos nos assets públicos.
  hideSourceMaps: hasSentryAuthToken,

  // Suprime saída do CLI fora de CI para não poluir logs locais.
  silent: !process.env.CI,
  telemetry: false,

  sourcemaps: {
    disable: !hasSentryAuthToken,
  },

  release: {
    create: hasSentryAuthToken,
    finalize: hasSentryAuthToken,
  },

  // Necessário para App Router com muitos arquivos de página.
  widenClientFileUpload: true,

  webpack: {
    disableSentryConfig: !hasSentryAuthToken,

    // Não injeta logging de debug do SDK no bundle final.
    treeshake: {
      removeDebugLogging: true,
    },
    automaticVercelMonitors: false,
  },
});
