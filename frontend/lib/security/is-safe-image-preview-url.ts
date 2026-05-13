const ALLOWED_IMAGE_HOST_SUFFIXES = [
  'r2.cloudflarestorage.com',
  'supabase.co',
] as const;
const DANGEROUS_CHARS = /[\u0000-\u001f\u007f\\]/;

export function isSafeImagePreviewUrl(url?: string | null): boolean {
  const normalized = String(url ?? '').trim();
  if (!normalized) {
    return false;
  }
  if (DANGEROUS_CHARS.test(normalized)) {
    return false;
  }
  try {
    if (DANGEROUS_CHARS.test(decodeURIComponent(normalized))) {
      return false;
    }
  } catch {
    return false;
  }

  const lower = normalized.toLowerCase();
  if (
    lower.startsWith('data:image/') ||
    lower.startsWith('blob:')
  ) {
    return true;
  }
  if (normalized.startsWith('//')) {
    return false;
  }
  if (normalized.startsWith('/')) {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return true;
  }

  return ALLOWED_IMAGE_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}
