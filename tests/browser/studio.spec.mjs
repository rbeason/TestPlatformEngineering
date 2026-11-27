import { expect, test } from '@playwright/test';

test('a marketer can submit copy and a reviewer can request edits and approve the revision', async ({
  page,
}, testInfo) => {
  await page.goto('/studio/');
  const status = page.getByRole('status');
  await page
    .getByRole('textbox', { name: 'Headline' })
    .fill('A brighter launch');
  await page.getByRole('button', { name: 'Mobile' }).click();
  await expect(page.getByRole('button', { name: 'Mobile' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('heading', { name: 'A brighter launch' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(status).toHaveText('In review');

  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download for GitHub PR' }).click();
  expect((await downloaded).suggestedFilename()).toBe('new-campaign.json');

  await page.getByRole('button', { name: 'Reviewer' }).click();
  await page.getByRole('button', { name: 'Request changes' }).click();
  await expect(page.getByRole('alert')).toContainText('Add a review note');
  await page
    .getByRole('textbox', { name: 'Review note' })
    .fill('Clarify who this is for.');
  await page.getByRole('button', { name: 'Request changes' }).click();
  await expect(status).toHaveText('Changes requested');
  await page.getByRole('button', { name: 'Marketer' }).click();
  await expect(
    page.getByText('Review note: Clarify who this is for.'),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Headline' })
    .fill('A launch workshop for marketers');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.getByRole('button', { name: 'Reviewer' }).click();
  await page.getByRole('button', { name: 'Approve draft' }).click();
  await expect(status).toHaveText('Approved');
  await page.reload();
  await expect(status).toHaveText('Approved');
  await expect(
    page.getByRole('heading', { name: 'A launch workshop for marketers' }),
  ).toBeVisible();
  await testInfo.attach('Campaign Studio preview', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
