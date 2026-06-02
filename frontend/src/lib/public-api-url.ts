const LEGACY_RENDER_API_HOST = 'sgs-backend-web-d49b.onrender.com';
const CANONICAL_PROD_API_ORIGIN = 'https://api.sgsseguranca.com.br';

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

  if (parsedUrl.hostname === LEGACY_RENDER_API_HOST) {
    return CANONICAL_PROD_API_ORIGIN;
  }

  const normalized = parsedUrl.toString();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}
