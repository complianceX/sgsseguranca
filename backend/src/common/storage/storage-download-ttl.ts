export const INTERNAL_DOWNLOAD_TTL_SECONDS = 900;
export const EMAIL_LINK_DOWNLOAD_TTL_SECONDS = 24 * 60 * 60;

function normalizePositiveInt(
  requested: number | undefined,
  fallback: number,
): number {
  if (!Number.isFinite(requested) || Number(requested) <= 0) {
    return fallback;
  }

  return Math.floor(Number(requested));
}

export function normalizeInternalDownloadTtl(
  requested?: number,
): number {
  return Math.min(
    normalizePositiveInt(requested, INTERNAL_DOWNLOAD_TTL_SECONDS),
    INTERNAL_DOWNLOAD_TTL_SECONDS,
  );
}

export function normalizeEmailLinkDownloadTtl(
  requested?: number,
): number {
  return Math.min(
    normalizePositiveInt(requested, EMAIL_LINK_DOWNLOAD_TTL_SECONDS),
    EMAIL_LINK_DOWNLOAD_TTL_SECONDS,
  );
}
