const PRODUCTION_CANONICAL_ORIGINS = ['https://app.sgsseguranca.com.br'];

const DEVELOPMENT_DEFAULT_ORIGINS = [
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
];

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '');
}

function parseConfiguredOrigins(rawOrigins?: string | null): string[] {
  if (!rawOrigins?.trim()) {
    return [];
  }

  return rawOrigins
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
}

function uniqueOrigins(origins: string[]): string[] {
  return Array.from(new Set(origins.map((origin) => normalizeOrigin(origin))));
}

function isDevNetworkOrigin(origin: string): boolean {
  return (
    /^http:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}$/i.test(origin) ||
    /^http:\/\/(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}):\d{2,5}$/i.test(
      origin,
    )
  );
}

export function resolveAllowedCorsOrigins(options: {
  isProduction: boolean;
  configuredOriginsRaw?: string | null;
}): string[] {
  const configuredOrigins = parseConfiguredOrigins(
    options.configuredOriginsRaw,
  );

  if (options.isProduction) {
    return uniqueOrigins([
      ...configuredOrigins,
      ...PRODUCTION_CANONICAL_ORIGINS,
    ]);
  }

  return uniqueOrigins([...configuredOrigins, ...DEVELOPMENT_DEFAULT_ORIGINS]);
}

export function normalizeOriginValue(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isCorsOriginAllowed(options: {
  origin?: string;
  allowedOrigins: string[];
  isProduction: boolean;
  allowPrivateNetworkDevOrigins?: boolean;
}): boolean {
  const origin = options.origin?.trim();
  if (!origin || origin === 'null') {
    return false;
  }

  if (options.allowedOrigins.includes(origin)) {
    return true;
  }

  if (options.isProduction) {
    return false;
  }

  if (!options.allowPrivateNetworkDevOrigins) {
    return false;
  }

  return isDevNetworkOrigin(origin);
}
