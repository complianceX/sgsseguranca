export const ALLOWED_CORS_HEADERS = [
  'Content-Type',
  'Authorization',
  'Cache-Control',
  'Pragma',
  'X-Request-ID',
  'x-company-id',
  'x-csrf-token',
  'x-refresh-csrf',
  'x-client-fingerprint',
  'Idempotency-Key',
  'sentry-trace',
  'baggage',
] as const;
