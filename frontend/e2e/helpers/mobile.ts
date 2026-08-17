import { expect, type Locator, type Page } from '@playwright/test';

export async function expectNoHorizontalPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));

  expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
}

export async function waitForApplicationStyles(page: Page, inputSelector = 'input') {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const bodyFont = window.getComputedStyle(document.body).fontFamily;
    return bodyFont !== 'Times New Roman' && bodyFont.length > 0;
  });
  await page.waitForFunction((selector) => {
    const input = document.querySelector(selector);
    if (!(input instanceof HTMLElement)) return false;
    const styles = window.getComputedStyle(input);
    return Number.parseFloat(styles.fontSize) >= 16 && Number.parseFloat(styles.minHeight) >= 44;
  }, inputSelector);
}

export async function expectMobileControlSize(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

export async function expectInputAvoidsIosZoom(locator: Locator) {
  const fontSize = await locator.evaluate((element) =>
    Number.parseFloat(window.getComputedStyle(element).fontSize),
  );
  expect(fontSize).toBeGreaterThanOrEqual(16);
}
