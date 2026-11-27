import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { URL } from 'node:url';
import test from 'node:test';
import { findPreview, parseBrief } from '../src/lib/studio-jobs.mjs';
import worker from '../worker/studio.mjs';

test('accepts a creative brief but restricts the slug to a single route segment', () => {
  assert.deepEqual(
    parseBrief({ slug: ' webinar ', prompt: ' A coral and navy hero. ' }),
    {
      slug: 'webinar',
      prompt: 'A coral and navy hero.',
    },
  );
  for (const slug of ['../other', '$HOME', 'two--hyphens', 'root/child']) {
    assert.throws(() => parseBrief({ slug, prompt: 'Add a hero' }), /slug/);
  }
  assert.throws(() => parseBrief({ slug: 'webinar', prompt: '   ' }), /prompt/);
});

test('uses only a Worker preview from Cloudflare’s PR comment', () => {
  const author = { login: 'cloudflare-workers-and-pages' };
  const body =
    'Preview: [Open](https://pr-17-testplatformengineering.eason-bryce.workers.dev)';
  assert.equal(
    findPreview([{ author, body }], 'webinar'),
    'https://pr-17-testplatformengineering.eason-bryce.workers.dev/lp/webinar/',
  );
  assert.equal(
    findPreview([{ author: { login: 'some-user' }, body }], 'webinar'),
    null,
  );
  assert.equal(
    findPreview(
      [{ author, body: body.replace('.dev', '.dev.example.com') }],
      'webinar',
    ),
    null,
  );
  assert.equal(
    findPreview(
      [
        {
          author,
          body: 'https://testplatformengineering.eason-bryce.workers.dev',
        },
      ],
      'webinar',
    ),
    null,
  );
});

test('the hosted queue separates browser and runner access and publishes exactly one claimed job', async (context) => {
  const sql = new DatabaseSync(':memory:');
  context.after(() => sql.close());
  sql.exec(
    readFileSync(
      new URL('../migrations/0001_studio_jobs.sql', import.meta.url),
      'utf8',
    ),
  );
  const env = {
    STUDIO_BROWSER_TOKEN: 'browser-key-for-tests-with-32-characters',
    STUDIO_RUNNER_TOKEN: 'runner-key-for-tests-with-32-characters',
    STUDIO_DB: {
      prepare(query) {
        const statement = sql.prepare(query);
        const bound = (args) => ({
          async first() {
            return statement.get(...args) ?? null;
          },
          async run() {
            return statement.run(...args);
          },
        });
        return { ...bound([]), bind: (...args) => bound(args) };
      },
    },
  };

  const host = 'testplatformengineering.eason-bryce.workers.dev';
  async function send(secret, route = '', payload, name = host) {
    return worker.fetch(
      new globalThis.Request(`https://${name}/api/studio-agent${route}`, {
        method: payload ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: payload ? JSON.stringify(payload) : undefined,
      }),
      env,
    );
  }

  const brief = { slug: 'webinar', prompt: 'Create a coral webinar.' };
  const browser = env.STUDIO_BROWSER_TOKEN;
  const runner = env.STUDIO_RUNNER_TOKEN;
  const claim = randomUUID();
  assert.equal(
    (await send(browser, '', brief, `some-preview-${host}`)).status,
    404,
  );
  assert.equal((await send(runner, '', brief)).status, 401);
  assert.equal((await send(browser, '/claim', { claim })).status, 401);

  const queued = await send(browser, '', brief);
  assert.equal(queued.status, 202);
  const { job: publicJob } = await queued.json();
  assert.equal(publicJob.status, 'queued');
  assert.equal(publicJob.prompt, undefined);
  assert.equal((await send(browser, '', brief)).status, 409);

  const { job } = await (await send(runner, '/claim', { claim })).json();
  assert.deepEqual(job, { id: publicJob.id, ...brief });
  assert.deepEqual(await (await send(runner, '/claim', { claim })).json(), {
    job,
  });
  assert.deepEqual(
    await (await send(runner, '/claim', { claim: randomUUID() })).json(),
    { job: null },
  );

  const prUrl = 'https://github.com/rbeason/TestPlatformEngineering/pull/17';
  const previewUrl =
    'https://pr-17-testplatformengineering.eason-bryce.workers.dev/lp/webinar/';
  const update = {
    id: job.id,
    claim,
    prUrl,
    status: 'previewing',
    message: 'Waiting for preview.',
  };
  assert.equal(
    (await send(runner, '/update', { ...update, claim: randomUUID() })).status,
    404,
  );
  assert.equal((await send(runner, '/update', update)).status, 200);
  assert.equal(
    (await send(runner, '/update', { ...update, status: 'review', previewUrl }))
      .status,
    200,
  );
  const { job: review } = await (await send(browser)).json();
  assert.equal(review.prUrl, prUrl);
  assert.equal(review.previewUrl, previewUrl);
  assert.equal(review.status, 'review');
  assert.equal(
    sql.prepare('SELECT prompt FROM studio_jobs WHERE id = ?').get(job.id)
      .prompt,
    '',
  );
});
