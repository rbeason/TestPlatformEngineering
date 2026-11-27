import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const output = new URL('../dist/', import.meta.url);

test('the built homepage has a document language, title, and main landmark', async () => {
  const html = await readFile(new URL('index.html', output), 'utf8');
  assert.match(html, /<html\b[^>]*\blang="en"/);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(
    html,
    /<main\b[^>]*>[\s\S]*<h1\b[^>]*>[^<]+<\/h1>[\s\S]*<\/main>/,
  );
});

test('the built homepage includes compiled Tailwind utilities', async () => {
  const html = await readFile(new URL('index.html', output), 'utf8');
  const stylesheets = [
    ...html.matchAll(/<link\b[^>]*\bhref="(\/_astro\/[^"]+\.css)"[^>]*>/g),
  ];
  const cssFiles = await Promise.all(
    stylesheets.map(([, path]) =>
      readFile(new URL(path.slice(1), output), 'utf8'),
    ),
  );
  assert.match(
    [html, ...cssFiles].join('\n'),
    /\.min-h-screen\s*\{min-height:\s*100vh/,
  );
});
