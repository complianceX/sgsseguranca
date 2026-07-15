import { expect, test } from '@playwright/test';
import {
  expectInputAvoidsIosZoom,
  expectMobileControlSize,
  expectNoHorizontalPageOverflow,
} from './helpers/mobile';

test.describe('rotas públicas em viewports operacionais', () => {
  test('login não possui overflow e evita zoom automático no iOS', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('main')).toBeVisible();
    await expectNoHorizontalPageOverflow(page);

    const visibleInputs = page.locator('input:visible');
    const count = await visibleInputs.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      await expectInputAvoidsIosZoom(visibleInputs.nth(index));
      await expectMobileControlSize(visibleInputs.nth(index));
    }

    const submit = page.locator('button[type="submit"]:visible').first();
    await expect(submit).toBeVisible();
    await expectMobileControlSize(submit);
  });

  test('recuperação de senha permanece utilizável sem overflow', async ({ page }) => {
    await page.goto('/forgot-password');
    await expectNoHorizontalPageOverflow(page);
    const email = page.locator('input[type="email"]:visible').first();
    await expect(email).toBeVisible();
    await expectInputAvoidsIosZoom(email);
    await expectMobileControlSize(email);
  });

  test('dashboard sem sessão redireciona sem expor conteúdo protegido', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/login(?:\?|$)/);
    await expect(page).toHaveURL(/\/login/);
    await expectNoHorizontalPageOverflow(page);
  });
});
