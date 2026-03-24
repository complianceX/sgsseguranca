// ---------------------------------------------------------------------------
// Sentry — client-side initialisation (browser)
// Loaded automatically by @sentry/nextjs before any app code.
// ---------------------------------------------------------------------------

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_BUILD_ID,

    // 10% de transações em produção; 100% em dev para facilitar debug
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session replay: apenas em erros (não gravar sessões normais)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,

    integrations: [
      Sentry.replayIntegration({
        // Máscara total para LGPD — nunca gravar conteúdo de campos
        maskAllText: true,
        blockAllMedia: true,
        maskAllInputs: true,
      }),
    ],

    denyUrls: [
      // Extensões de browser — erros gerados por extensões não nos interessam
      /extensions\//i,
      /^chrome-extension:\/\//i,
      /^moz-extension:\/\//i,
      /^safari-extension:\/\//i,
      /^safari-web-extension:\/\//i,
    ],

    beforeSend(event) {
      const errorType = event.exception?.values?.[0]?.type ?? '';
      const errorMsg  = event.exception?.values?.[0]?.value ?? '';

      // Filtrar erros irrelevantes que poluem o dashboard
      if (
        errorType === 'ChunkLoadError' ||
        errorMsg.includes('ChunkLoadError') ||
        errorMsg.includes('Loading chunk') ||
        errorMsg.includes('ResizeObserver loop') ||
        errorMsg.includes('Network Error') ||
        errorMsg.includes('ERR_NETWORK') ||
        errorMsg.includes('Load failed')   // Safari network errors
      ) {
        return null;
      }

      // Remover PII de mensagens de erro (LGPD)
      if (event.message) {
        event.message = scrubbedText(event.message);
      }
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) ex.value = scrubbedText(ex.value);
        }
      }

      return event;
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Remove CPF e e-mail de strings antes de enviar ao Sentry. */
function scrubbedText(text: string): string {
  return text
    // CPF com ou sem formatação: 000.000.000-00 / 00000000000
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '[CPF]')
    // E-mail
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
}
