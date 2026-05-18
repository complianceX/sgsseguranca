#!/usr/bin/env node

async function main() {
  const Sentry = require('@sentry/node');

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    throw new Error('Missing SENTRY_DSN');
  }

  const marker =
    process.env.SENTRY_SMOKE_MARKER ||
    `server_sentry_smoke_${new Date().toISOString().replace(/[:.]/g, '-')}`;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    tracesSampleRate: 0,
    attachStacktrace: true,
    release: process.env.SENTRY_RELEASE || process.env.npm_package_version,
  });

  const error = new Error(marker);
  error.name = 'SentrySmokeError';

  Sentry.captureException(error, {
    tags: {
      source: 'render-job-smoke',
      marker,
    },
    extra: {
      serviceId: process.env.RENDER_SERVICE_ID || 'unknown',
      serviceName: process.env.RENDER_SERVICE_NAME || 'unknown',
    },
  });

  const eventId =
    typeof Sentry.lastEventId === 'function' ? Sentry.lastEventId() : null;
  const flushed = await Sentry.flush(5000);

  console.log(
    JSON.stringify(
      {
        ok: flushed,
        eventId,
        marker,
        environment:
          process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || null,
      },
      null,
      2,
    ),
  );

  process.exit(flushed ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
