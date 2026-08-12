import type { PuppeteerNode } from 'puppeteer';

type PuppeteerModule = PuppeteerNode;
type PuppeteerImport = PuppeteerModule & { default?: PuppeteerModule };

let modulePromise: Promise<PuppeteerModule> | undefined;

/**
 * Puppeteer 25 is ESM-only. Keeping the import lazy prevents the CJS Jest
 * worker from trying to require the ESM package while still loading it
 * normally in the production worker when PDF generation is requested.
 */
export function loadPuppeteer(): Promise<PuppeteerModule> {
  if (!modulePromise) {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const dynamicImport = new Function(
      'specifier',
      'return import(specifier);',
    ) as (specifier: string) => Promise<PuppeteerImport>;
    modulePromise = dynamicImport('puppeteer').then((module) => {
      const instance = module.default ?? module;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const launch = instance.launch.bind(instance);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const executablePath = instance.executablePath.bind(instance);
      return {
        ...instance,
        launch,
        executablePath,
      };
    });
  }

  return modulePromise!;
}
