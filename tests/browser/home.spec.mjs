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

  const gettingStarted = page.getByRole('region', { name: 'Getting started' });
  await expect(
    gettingStarted.getByRole('heading', { name: 'Getting started', level: 2 }),
  ).toBeVisible();
  const steps = gettingStarted.getByRole('list').getByRole('listitem');
  await expect(steps).toHaveText([
    'Install dependencies with npm ci.',
    'Start the development server with npm run dev.',
    'Open the local URL printed in your terminal, then edit src/pages/index.astro.',
  ]);

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
