type SentryInitOptions = {
  dsn: string;
  environment?: string;
  tracesSampleRate?: number;
  release?: string;
  attachStacktrace?: boolean;
  sendDefaultPii?: boolean;
  beforeSend?: (
    event: Record<string, unknown>,
  ) => Record<string, unknown> | null;
};

type SentryUser = {
  id?: string;
  email?: string;
  username?: string;
};

type SentryBreadcrumb = {
  message: string;
  category?: string;
  level?: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
  data?: Record<string, unknown>;
};

type SentryLike = {
  init: (options: SentryInitOptions) => void;
  captureException: (error: unknown, context?: unknown) => void;
  captureMessage: (message: string, level?: string, context?: unknown) => void;
  setTag: (key: string, value: string) => void;
  setUser: (user: SentryUser | null) => void;
  addBreadcrumb: (breadcrumb: SentryBreadcrumb) => void;
  withScope: (callback: (scope: SentryScope) => void) => void;
};

type SentryScope = {
  setExtra: (key: string, value: unknown) => void;
  setTag: (key: string, value: string) => void;
  setUser: (user: SentryUser | null) => void;
};

let sentry: SentryLike | null = null;

function scrubSentryText(text: string): string {
  const s = text.length > 4000 ? text.slice(0, 4000) : text;
  return s
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '[CPF]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    .replace(/(?:\+55\s?)?\(?\d{2}\)?\s?\d{4,5}-?\d{4}/g, '[TELEFONE]')
    .replace(
      /(medico_responsavel|crm_medico|observacoes|observacao|diagnostico|laudo|resultado_exame|resultado|relato|historico|anamnese|queixa|tratamento|prescricao|atestado|crm):\s*[^,\n"]{1,200}/gi,
      '$1: [REDACTED]',
    );
}

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
      release: process.env.SENTRY_RELEASE || process.env.npm_package_version,
      attachStacktrace: true,
      sendDefaultPii: false,
      beforeSend(event) {
        // Remove PII de mensagens antes de enviar ao Sentry
        if (typeof event['message'] === 'string') {
          event['message'] = scrubSentryText(event['message']);
        }
        const exValues = (
          event['exception'] as
            { values?: Array<{ value?: string }> } | undefined
        )?.values;
        if (Array.isArray(exValues)) {
          for (const ex of exValues) {
            if (typeof ex.value === 'string') {
              ex.value = scrubSentryText(ex.value);
            }
          }
        }
        return event;
      },
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

/**
 * Registra o usuário atual no contexto de erros Sentry.
 * Chamar com `null` para limpar o usuário (ex.: no logout).
 */
export function setSentryUser(user: SentryUser | null): void {
  if (!sentry) {
    return;
  }
  sentry.setUser(user);
}

/**
 * Adiciona um breadcrumb ao trail de contexto Sentry para o request atual.
 * Útil para registrar eventos de negócio antes de um erro (ex.: "APR aprovada").
 */
export function addSentryBreadcrumb(breadcrumb: SentryBreadcrumb): void {
  if (!sentry) {
    return;
  }
  sentry.addBreadcrumb(breadcrumb);
}

/**
 * Captura uma mensagem informativa no Sentry (não um erro).
 * Use para eventos críticos de negócio que merecem rastreamento (ex.: quota atingida).
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  extra?: Record<string, unknown>,
): void {
  if (!sentry) {
    return;
  }
  if (extra) {
    sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(extra)) {
        scope.setExtra(key, value);
      }
      sentry!.captureMessage(message, level);
    });
  } else {
    sentry.captureMessage(message, level);
  }
}
