import type { PuppeteerNode } from 'puppeteer';

type PuppeteerModule = Pick<PuppeteerNode, 'launch' | 'executablePath'>;
type PuppeteerImport = PuppeteerModule & { default?: PuppeteerModule };

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function(
  'specifier',
  'return import(specifier);',
) as (specifier: string) => Promise<PuppeteerImport>;

let modulePromise: Promise<PuppeteerModule> | undefined;

/**
 * Puppeteer 25 is ESM-only. Keeping the import lazy prevents the CJS Jest
 * worker from trying to require the ESM package while still loading it
 * normally in the production worker when PDF generation is requested.
 */
export function loadPuppeteer(): Promise<PuppeteerModule> {
  if (!modulePromise) {
    modulePromise = dynamicImport('puppeteer').then((module) => {
      return {
        launch: module.launch,
        executablePath: module.executablePath,
      };
    });
  }
  return modulePromise;
}
