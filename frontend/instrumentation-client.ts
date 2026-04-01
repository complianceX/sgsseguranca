import * as Sentry from '@sentry/nextjs';
import { scrubbedText } from '@/lib/sentry/scrub';
import { triggerStuckRouteRecovery } from '@/lib/stuck-route-recovery';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_APP_ENV ??
      process.env.NODE_ENV ??
      'development',
    release: process.env.NEXT_PUBLIC_BUILD_ID,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
        maskAllInputs: true,
      }),
    ],
    denyUrls: [
      /extensions\//i,
      /^chrome-extension:\/\//i,
      /^moz-extension:\/\//i,
      /^safari-extension:\/\//i,
      /^safari-web-extension:\/\//i,
    ],
    beforeSend(event) {
      const errorType = event.exception?.values?.[0]?.type ?? '';
      const errorMessage = event.exception?.values?.[0]?.value ?? '';

      if (
        errorType === 'ChunkLoadError' ||
        errorMessage.includes('ChunkLoadError') ||
        errorMessage.includes('Loading chunk') ||
        errorMessage.includes('ResizeObserver loop') ||
        errorMessage.includes('Network Error') ||
        errorMessage.includes('ERR_NETWORK') ||
        errorMessage.includes('Load failed')
      ) {
        return null;
      }

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

if (typeof window !== 'undefined') {
  const isChunkLoadingFailure = (message: string, type: string) => {
    return (
      type === 'ChunkLoadError' ||
      message.includes('ChunkLoadError') ||
      message.includes('Loading chunk') ||
      message.includes('dynamically imported module') ||
      message.includes('Failed to fetch dynamically imported module')
    );
  };

  const tryRecoverFromChunkError = (
    message: string | undefined,
    type: string | undefined,
  ) => {
    const normalizedMessage = (message || '').trim();
    const normalizedType = (type || '').trim();
    if (!isChunkLoadingFailure(normalizedMessage, normalizedType)) {
      return;
    }

    void triggerStuckRouteRecovery('chunk-load-error');
  };

  window.addEventListener('error', (event) => {
    tryRecoverFromChunkError(event.message, event.error?.name);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as
      | { message?: string; name?: string }
      | undefined;
    tryRecoverFromChunkError(reason?.message, reason?.name);
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
