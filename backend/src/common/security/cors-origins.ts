const PRODUCTION_CANONICAL_ORIGINS = ['https://app.sgsseguranca.com.br'];

const DEVELOPMENT_DEFAULT_ORIGINS = [
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

export function resolveAllowedCorsOrigins(options: {
  isProduction: boolean;
  configuredOriginsRaw?: string | null;
}): string[] {
  const configuredOrigins = parseConfiguredOrigins(options.configuredOriginsRaw);

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
