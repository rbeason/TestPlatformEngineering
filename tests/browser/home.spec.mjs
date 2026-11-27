import { expect, test } from '@playwright/test';
import axe from 'axe-core';

test('the homepage renders, fits the viewport, and passes automated accessibility checks', async ({
  page,
}, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await expect(
    page.getByRole('main').getByRole('heading', { level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('main')).toHaveCSS('display', 'grid');
  expect(
    await page.evaluate(() => globalThis.document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => globalThis.innerWidth));

  await testInfo.attach('Homepage preview', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.addScriptTag({ content: axe.source });
  const { violations } = await page.evaluate(() => globalThis.axe.run());
  expect(
    violations.map(({ id, nodes }) => ({
      id,
      elements: nodes.map(({ target }) => target),
    })),
  ).toEqual([]);
  expect(pageErrors).toEqual([]);
});
