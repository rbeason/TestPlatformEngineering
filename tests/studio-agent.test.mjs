import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import {
  findPreview,
  parseBrief,
  studioAgent,
} from '../scripts/studio-agent.mjs';

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

test('the local runner rejects a non-loopback host or cross-origin submission', async () => {
  let handle;
  studioAgent().configureServer({
    middlewares: {
      use: (middleware) => {
        handle = middleware;
      },
    },
  });
  async function request(method, host, origin) {
    let result;
    let statusCode;
    const input = Object.assign(Readable.from([]), {
      method,
      url: '/api/studio-agent',
      headers: { host, origin, 'content-type': 'application/json' },
      socket: { remoteAddress: '127.0.0.1' },
    });
    await handle(
      input,
      {
        writeHead(status) {
          statusCode = status;
        },
        end(body) {
          result = JSON.parse(body);
        },
      },
      () => assert.fail('Unexpected fallthrough'),
    );
    return { statusCode, result };
  }

  assert.equal((await request('GET', 'foreign.example:4321')).statusCode, 403);
  assert.equal(
    (await request('POST', '127.0.0.1:4321', 'http://foreign.example'))
      .statusCode,
    403,
  );
  assert.deepEqual(await request('GET', '127.0.0.1:4321'), {
    statusCode: 200,
    result: { job: null },
  });
});
