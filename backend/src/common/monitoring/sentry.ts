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

export type SentryInitStatus =
  | {
      status: 'disabled';
      reason: 'dsn_missing';
    }
  | {
      status: 'enabled';
      environment?: string;
      tracesSampleRate: number;
      serviceTag: string;
    }
  | {
      status: 'unavailable';
      reason: 'package_not_installed' | 'initialization_failed';
      environment?: string;
      tracesSampleRate: number;
      serviceTag: string;
      message?: string;
    };

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

export function initSentry(serviceTag = 'backend'): SentryInitStatus {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    sentry = null;
    return {
      status: 'disabled',
      reason: 'dsn_missing',
    };
  }

  const environment =
    process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
  const tracesSampleRate = parseSampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
  );

  try {
    // Optional dependency. App keeps running if package is not installed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk = require('@sentry/node') as SentryLike;
    sdk.init({
      dsn,
      environment,
      tracesSampleRate,
    });
    sdk.setTag('service', serviceTag);
    sentry = sdk;
    return {
      status: 'enabled',
      environment,
      tracesSampleRate,
      serviceTag,
    };
  } catch (error) {
    sentry = null;
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'unavailable',
      reason: message.includes('@sentry/node')
        ? 'package_not_installed'
        : 'initialization_failed',
      environment,
      tracesSampleRate,
      serviceTag,
      message,
    };
  }
}

export function captureException(error: unknown, context?: unknown): void {
  if (!sentry) {
    return;
  }
  sentry.captureException(error, context);
}
