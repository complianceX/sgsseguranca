const CANONICAL_PROD_API_ORIGIN = 'https://api.sgsseguranca.com.br';
const PROXY_PATH = '/proxy';

function readAppOrigin(): string | null {
  const rawAppUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!rawAppUrl) {
    return null;
  }

  try {
    const parsedAppUrl = new URL(rawAppUrl);
    const normalized = parsedAppUrl.toString();
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  } catch {
    return null;
  }
}

export function normalizePublicApiBaseUrl(
  rawApiUrl?: string | null,
): string | null {
  const value = rawApiUrl?.trim();
  if (!value) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    return value.endsWith('/') ? value.slice(0, -1) : value;
  }

  if (parsedUrl.origin === CANONICAL_PROD_API_ORIGIN) {
    const appOrigin = readAppOrigin();
    if (appOrigin) {
      return new URL(PROXY_PATH, appOrigin).toString().replace(/\/$/, '');
    }

    return CANONICAL_PROD_API_ORIGIN;
  }

  const normalized = parsedUrl.toString();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}
