type BrowserSentryModule = typeof import('@sentry/browser');

let browserSentryModule: BrowserSentryModule | null = null;
let browserSentryPromise: Promise<BrowserSentryModule | null> | null = null;

const hasSentryDsn = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

export function getBrowserSentrySync(): BrowserSentryModule | null {
  return browserSentryModule;
}

export function loadBrowserSentry(): Promise<BrowserSentryModule | null> {
  if (typeof window === 'undefined' || !hasSentryDsn) {
    return Promise.resolve(null);
  }

  if (browserSentryModule) {
    return Promise.resolve(browserSentryModule);
  }

  if (!browserSentryPromise) {
    browserSentryPromise = import('@sentry/browser')
      .then((module) => {
        browserSentryModule = module;
        return module;
      })
      .catch(() => null);
  }

  return browserSentryPromise;
}
