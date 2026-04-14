import { execSync } from 'node:child_process';
import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

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
const nextConfig = {
  generateBuildId: async () => serviceWorkerBuildId,
  env: {
    NEXT_PUBLIC_BUILD_ID: serviceWorkerBuildId,
  },

  // Não expõe o header "X-Powered-By: Next.js" (fingerprinting)
  poweredByHeader: false,

  // Compressão gzip/brotli via Next.js (Vercel já faz, mas ativa para outros targets)
  compress: true,

  // Otimização de imports de bibliotecas grandes — evita importar bundle inteiro
  // quando apenas um subset de componentes/funções é usado.
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-popover',
      '@radix-ui/react-accordion',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-switch',
      '@radix-ui/react-separator',
      '@radix-ui/react-label',
      '@radix-ui/react-avatar',
      '@radix-ui/react-badge',
    ],
  },

  // Domínios permitidos para next/image — evita erros de hostname não configurado
  images: {
    remotePatterns: [
      // Cloudflare R2 (evidências, assinaturas, PDFs)
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
      },
      // Supabase Storage (se usado para avatares/logos)
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
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
    const headers = [
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
      // Segurança: aplicar em todas as rotas
      {
        source: '/(.*)',
        headers,
      },
      // Cache agressivo para assets estáticos do Next.js (imutáveis por hash)
      // Vercel já faz isso, mas garante comportamento correto em outros runtimes
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Favicons e assets públicos estáticos — cachear por 24h
      {
        source: '/(favicon.ico|favicon.png|robots.txt|sitemap.xml|manifest.json)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=3600',
          },
        ],
      },
    ];
  },

  // Redirects de segurança — garantir HTTPS em produção
  async redirects() {
    if (!isProd) return [];
    return [];
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
