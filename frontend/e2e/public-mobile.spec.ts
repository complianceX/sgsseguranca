import { expect, test } from '@playwright/test';
import {
  expectInputAvoidsIosZoom,
  expectMobileControlSize,
  expectNoHorizontalPageOverflow,
  waitForApplicationStyles,
} from './helpers/mobile';

test.describe('rotas públicas em viewports operacionais', () => {
  test('login não possui overflow e evita zoom automático no iOS', async ({ page }) => {
    await page.goto('/login');
    await waitForApplicationStyles(page, 'input');
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
    await waitForApplicationStyles(page, '#cpf');
    await expectNoHorizontalPageOverflow(page);
    const cpf = page.locator('#cpf:visible').first();
    await expect(cpf).toBeVisible();
    await expectInputAvoidsIosZoom(cpf);
    await expectMobileControlSize(cpf);
  });

  test('dashboard sem sessão redireciona sem expor conteúdo protegido', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/login(?:\?|$)/);
    await waitForApplicationStyles(page, 'input');
    await expect(page).toHaveURL(/\/login/);
    await expectNoHorizontalPageOverflow(page);
  });
});
