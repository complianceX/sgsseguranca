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
