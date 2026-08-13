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

let modulePromise: Promise<PuppeteerModule> | undefined;

function importPuppeteer(): Promise<PuppeteerModule> {
  return dynamicImport('puppeteer').then((module) => {
    return {
      launch: module.launch,
      executablePath: module.executablePath,
    };
  });
}

// E2E runs opt into VM modules and benefit from preloading before a Jest
// suite can tear down. Unit/smoke runs do not opt in and must remain entirely
// synchronous at module load time.
if (process.env.NODE_OPTIONS?.includes('--experimental-vm-modules')) {
  modulePromise = importPuppeteer();
}

/**
 * Puppeteer 25 is ESM-only. This bridge keeps the CJS worker from trying to
 * require the package while preloading only its JS module; Chromium itself is
 * still launched lazily when PDF generation is requested.
 */
export function loadPuppeteer(): Promise<PuppeteerModule> {
  if (!modulePromise) {
    modulePromise = importPuppeteer();
  }
  return modulePromise;
}
