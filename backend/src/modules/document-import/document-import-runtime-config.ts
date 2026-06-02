function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export function getDocumentImportJobTimeoutMs(): number {
  return readPositiveIntEnv('DOCUMENT_IMPORT_QUEUE_TIMEOUT_MS', 180_000);
}

export function getDocumentImportJobAttempts(): number {
  return readPositiveIntEnv('DOCUMENT_IMPORT_QUEUE_ATTEMPTS', 3);
}

export function getDocumentImportQueueConcurrency(): number {
  return readPositiveIntEnv('DOCUMENT_IMPORT_QUEUE_CONCURRENCY', 2);
}

export function getDocumentImportOfficeArchiveMaxEntries(): number {
  return readPositiveIntEnv('DOCUMENT_IMPORT_OFFICE_MAX_ENTRIES', 512);
}

export function getDocumentImportOfficeArchiveMaxUncompressedBytes(): number {
  return readPositiveIntEnv(
    'DOCUMENT_IMPORT_OFFICE_MAX_UNCOMPRESSED_BYTES',
    32 * 1024 * 1024,
  );
}

export function getDocumentImportExtractedTextMaxBytes(): number {
  return readPositiveIntEnv(
    'DOCUMENT_IMPORT_EXTRACTED_TEXT_MAX_BYTES',
    2 * 1024 * 1024,
  );
}
