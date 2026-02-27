type SentryInitOptions = {
  dsn: string;
  environment?: string;
  tracesSampleRate?: number;
};

type SentryLike = {
  init: (options: SentryInitOptions) => void;
  captureException: (error: unknown, context?: unknown) => void;
  setTag: (key: string, value: string) => void;
};

let sentry: SentryLike | null = null;

function parseSampleRate(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
    return 0;
  }

  return parsed;
}

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  try {
    // Optional dependency. App keeps running if package is not installed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk = require('@sentry/node') as SentryLike;
    sdk.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
      tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
    });
    sdk.setTag('service', 'backend');
    sentry = sdk;
    console.log('[OBSERVABILITY] Sentry initialized.');
  } catch {
    console.warn(
      '[OBSERVABILITY] SENTRY_DSN is set but @sentry/node is not installed. Skipping Sentry.',
    );
  }
}

export function captureException(error: unknown, context?: unknown): void {
  if (!sentry) {
    return;
  }
  sentry.captureException(error, context);
}
