import { expect, test } from '@playwright/test';

test('a generated campaign shows its PR and finished preview in the review panel', async ({
  page,
}) => {
  let job = null;
  await page.route('**/api/studio-agent', async (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({
        slug: 'product-webinar',
        prompt: 'Build a navy webinar landing page with a coral button.',
      });
      job = { status: 'running', log: 'Starting Codex.' };
      await route.fulfill({ json: { job }, status: 202 });
      job = {
        status: 'review',
        log: 'Verification passed.',
        previewStatus: 'Preview ready',
        prUrl: 'https://github.com/rbeason/TestPlatformEngineering/pull/17',
        previewUrl:
          'https://pr-17-testplatformengineering.eason-bryce.workers.dev/lp/product-webinar/',
      };
      return;
    }
    await route.fulfill({ json: { job } });
  });

  await page.goto('/studio/generate/');
  await page
    .getByRole('textbox', { name: 'Page slug' })
    .fill('product-webinar');
  await page
    .getByRole('textbox', { name: 'Prompt' })
    .fill('Build a navy webinar landing page with a coral button.');
  await page.getByRole('button', { name: 'Generate draft' }).click();
  await expect(page.getByRole('status')).toHaveText('Preview ready');
  await expect(
    page.getByRole('link', { name: 'Open preview' }),
  ).toHaveAttribute('href', job.previewUrl);
  await expect(page.getByRole('link', { name: 'View PR' })).toHaveAttribute(
    'href',
    job.prUrl,
  );
});
