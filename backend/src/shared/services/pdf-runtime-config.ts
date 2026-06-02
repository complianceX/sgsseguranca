function parsePositiveInteger(
  rawValue: string | undefined,
  fallback: number,
  options?: {
    min?: number;
    max?: number;
  },
): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  const rounded = Math.floor(parsed);
  const min = options?.min ?? 1;
  const max = options?.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(Math.max(rounded, min), max);
}

export function getPdfGenerationConcurrency(): number {
  const fallback = process.env.NODE_ENV === 'production' ? 2 : 3;
  return parsePositiveInteger(
    process.env.PDF_GENERATION_CONCURRENCY,
    fallback,
    {
      min: 1,
      max: 4,
    },
  );
}

export function getPdfBrowserPoolSize(): number {
  return parsePositiveInteger(
    process.env.PDF_BROWSER_POOL_SIZE,
    getPdfGenerationConcurrency(),
    {
      min: 1,
      max: 4,
    },
  );
}

export function getPdfPageTimeoutMs(): number {
  return parsePositiveInteger(process.env.PDF_PAGE_TIMEOUT_MS, 60_000, {
    min: 15_000,
    max: 180_000,
  });
}

export function getPdfBrowserAcquireTimeoutMs(): number {
  return parsePositiveInteger(
    process.env.PDF_BROWSER_ACQUIRE_TIMEOUT_MS,
    30_000,
    {
      min: 5_000,
      max: 180_000,
    },
  );
}

export function getPdfBrowserMaxUses(): number {
  return parsePositiveInteger(process.env.PDF_BROWSER_MAX_USES, 40, {
    min: 5,
    max: 500,
  });
}

export function getPdfQueueJobTimeoutMs(): number {
  return parsePositiveInteger(process.env.PDF_QUEUE_JOB_TIMEOUT_MS, 300_000, {
    min: 60_000,
    max: 900_000,
  });
}

export function getInspectionInlineEvidenceMaxBytes(): number {
  return parsePositiveInteger(
    process.env.INSPECTION_INLINE_EVIDENCE_MAX_BYTES,
    1 * 1024 * 1024,
    {
      min: 128 * 1024,
      max: 10 * 1024 * 1024,
    },
  );
}
