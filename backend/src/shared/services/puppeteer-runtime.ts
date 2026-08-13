import type { PuppeteerNode } from 'puppeteer';

type PuppeteerModule = Pick<PuppeteerNode, 'launch' | 'executablePath'>;
type PuppeteerImport = PuppeteerModule & { default?: PuppeteerModule };

// Start resolving the ESM module as soon as this runtime bridge is loaded.
// Jest runs each E2E suite in an isolated VM; deferring the first import until
// the request handler can race with that VM being torn down and leave PDF
// generation with an "import after the Jest environment has been torn down"
// error. The import is still non-blocking and only loads Puppeteer's JS
// runtime; Chromium is launched lazily by the pool service.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function(
  'specifier',
  'return import(specifier);',
) as (specifier: string) => Promise<PuppeteerImport>;

const modulePromise: Promise<PuppeteerModule> = dynamicImport('puppeteer').then(
  (module) => {
    return {
      launch: module.launch,
      executablePath: module.executablePath,
    };
  },
);

/**
 * Puppeteer 25 is ESM-only. This bridge keeps the CJS worker from trying to
 * require the package while preloading only its JS module; Chromium itself is
 * still launched lazily when PDF generation is requested.
 */
export function loadPuppeteer(): Promise<PuppeteerModule> {
  return modulePromise;
}
