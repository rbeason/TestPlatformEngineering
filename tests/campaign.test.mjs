import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { validateCampaign } from '../src/lib/campaign.mjs';

const sample = JSON.parse(
  await readFile(
    new URL('../src/campaigns/campaign-kickoff.json', import.meta.url),
    'utf8',
  ),
);

test('normalizes content before it is written to a PR', () => {
  assert.deepEqual(
    validateCampaign({
      ...sample,
      headline: '  New launch  ',
      ignored: 'value',
    }),
    {
      ...sample,
      headline: 'New launch',
    },
  );
});

test('rejects invalid filenames, non-HTTPS links, credential URLs, and blank copy', () => {
  for (const override of [
    { slug: '../hidden' },
    { ctaUrl: 'javascript:alert(1)' },
    { ctaUrl: 'https://user@example.com/' },
    { description: '  ' },
  ]) {
    assert.throws(() => validateCampaign({ ...sample, ...override }));
  }
});

test('the campaign route produces a static page with metadata and its CTA', async () => {
  const html = await readFile(
    new URL('../dist/lp/campaign-kickoff/index.html', import.meta.url),
    'utf8',
  );
  assert.match(
    html,
    /<title>Turn a good idea into a great campaign\.<\/title>/,
  );
  assert.match(html, /name="description" content="Join a hands-on session/);
  assert.match(html, /href="https:\/\/example\.com\/register"/);
});
