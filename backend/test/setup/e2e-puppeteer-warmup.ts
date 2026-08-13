import { loadPuppeteer } from '../../src/shared/services/puppeteer-runtime';

beforeAll(async () => {
  if (process.env.E2E_INFRA_AVAILABLE !== 'false') {
    await loadPuppeteer();
  }
});
