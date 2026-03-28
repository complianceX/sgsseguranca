import * as Sentry from '@sentry/nextjs';
import { scrubbedText } from '@/lib/sentry/scrub';

function initializeServerSentry() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_BUILD_ID,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      if (event.message) {
        event.message = scrubbedText(event.message);
      }

      if (event.exception?.values) {
        for (const exception of event.exception.values) {
          if (exception.value) {
            exception.value = scrubbedText(exception.value);
          }
        }
      }

      return event;
    },
  });
}

function initializeEdgeSentry() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_BUILD_ID,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    initializeServerSentry();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    initializeEdgeSentry();
  }
}

export const onRequestError = Sentry.captureRequestError;
