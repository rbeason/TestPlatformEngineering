import {
  parseBrief,
  prPattern,
  previewPattern,
} from '../src/lib/studio-jobs.mjs';

const endpoint = '/api/studio-agent';
const publicFields =
  'id, slug, status, message, pr_url AS prUrl, preview_url AS previewUrl';

function reply(body, status = 200) {
  return globalThis.Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function authorized(request, secret) {
  const token = request.headers.get('Authorization')?.slice(7);
  if (
    !request.headers.get('Authorization')?.startsWith('Bearer ') ||
    !token ||
    typeof secret !== 'string' ||
    secret.length < 32
  )
    return false;

  const encoder = new globalThis.TextEncoder();
  const digest = (value) =>
    globalThis.crypto.subtle.digest('SHA-256', encoder.encode(value));
  const [left, right] = await Promise.all([digest(token), digest(secret)]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function readInput(request) {
  if (
    request.headers.get('Content-Type')?.split(';')[0] !== 'application/json' ||
    !request.body
  ) {
    throw new Error('Send a JSON request.');
  }
  const reader = request.body.getReader();
  const decoder = new globalThis.TextDecoder();
  let text = '';
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 20_000) throw new Error('Request is too large.');
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel();
  }
}

async function clearAbandoned(db, now) {
  await db
    .prepare(
      `UPDATE studio_jobs SET status = CASE WHEN pr_url IS NULL THEN 'failed' ELSE 'review' END,
      message = 'The runner disconnected. Check its terminal and GitHub before submitting again.',
      updated_at = ?
    WHERE status IN ('running', 'previewing') AND updated_at < ?`,
    )
    .bind(now, now - 90 * 60_000)
    .run();
}

async function browserRequest(request, db) {
  if (request.method === 'GET') {
    return reply({
      job: await db
        .prepare(
          `SELECT ${publicFields} FROM studio_jobs ORDER BY created_at DESC LIMIT 1`,
        )
        .first(),
    });
  }
  if (request.method !== 'POST')
    return reply({ error: 'Method not allowed.' }, 405);

  let brief;
  try {
    brief = parseBrief(await readInput(request));
  } catch (error) {
    return reply({ error: error.message }, 400);
  }

  const now = Date.now();
  await clearAbandoned(db, now);
  const job = await db
    .prepare(
      `INSERT OR IGNORE INTO studio_jobs (id, slug, prompt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?) RETURNING ${publicFields}`,
    )
    .bind(globalThis.crypto.randomUUID(), brief.slug, brief.prompt, now, now)
    .first();
  return job
    ? reply({ job }, 202)
    : reply({ error: 'A campaign is already queued or running.' }, 409);
}

function validPreview(value, slug) {
  const origin = value.match(previewPattern)?.[0];
  return origin && value === `${origin}/lp/${slug}/`;
}

async function runnerRequest(request, db, action) {
  if (request.method !== 'POST')
    return reply({ error: 'Method not allowed.' }, 405);

  let input;
  try {
    input = await readInput(request);
  } catch (error) {
    return reply({ error: error.message }, 400);
  }
  if (
    typeof input?.claim !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(input.claim)
  ) {
    return reply({ error: 'Invalid claim.' }, 400);
  }

  const now = Date.now();
  if (action === 'claim') {
    await clearAbandoned(db, now);
    const current = await db
      .prepare(
        `SELECT id, slug, prompt FROM studio_jobs WHERE claim = ? AND status = 'running'`,
      )
      .bind(input.claim)
      .first();
    if (current) return reply({ job: current });

    const job = await db
      .prepare(
        `UPDATE studio_jobs SET status = 'running', claim = ?, updated_at = ?,
        message = 'Codex is building and testing the page.'
      WHERE id = (SELECT id FROM studio_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1)
        AND status = 'queued'
      RETURNING id, slug, prompt`,
      )
      .bind(input.claim, now)
      .first();
    return reply({ job });
  }

  const current = await db
    .prepare(
      'SELECT slug, status, pr_url AS prUrl FROM studio_jobs WHERE id = ? AND claim = ?',
    )
    .bind(input.id ?? '', input.claim)
    .first();
  if (!current) return reply({ error: 'Job not found.' }, 404);

  const prUrl = input.prUrl ?? current.prUrl;
  const previewUrl = input.previewUrl ?? null;
  const allowedStatus = {
    running: ['running', 'previewing', 'failed'],
    previewing: ['previewing', 'review'],
    review: ['review'],
    failed: ['failed'],
  };
  if (
    !allowedStatus[current.status]?.includes(input.status) ||
    (prUrl !== null && (typeof prUrl !== 'string' || !prPattern.test(prUrl))) ||
    (current.prUrl && current.prUrl !== prUrl) ||
    ((input.status === 'previewing' || input.status === 'review') && !prUrl) ||
    (previewUrl !== null &&
      (typeof previewUrl !== 'string' ||
        !validPreview(previewUrl, current.slug))) ||
    typeof input.message !== 'string' ||
    input.message.length > 300
  )
    return reply({ error: 'Invalid job update.' }, 400);

  const updated = await db
    .prepare(
      `UPDATE studio_jobs SET status = ?, message = ?, updated_at = ?, pr_url = ?,
      preview_url = COALESCE(?, preview_url), prompt = CASE WHEN ? IN ('review', 'failed') THEN '' ELSE prompt END
      WHERE id = ? AND claim = ? AND status = ? RETURNING id`,
    )
    .bind(
      input.status,
      input.message,
      now,
      prUrl,
      previewUrl,
      input.status,
      input.id,
      input.claim,
      current.status,
    )
    .first();
  return updated
    ? reply({ ok: true })
    : reply({ error: 'Job changed. Retry the update.' }, 409);
}

export default {
  async fetch(request, env) {
    const url = new globalThis.URL(request.url);
    // Preview deployments serve generated pages. Only the production host accepts jobs.
    if (url.hostname !== 'testplatformengineering.eason-bryce.workers.dev') {
      return reply({ error: 'Open the production Studio to run Codex.' }, 404);
    }
    const action =
      url.pathname === `${endpoint}/claim`
        ? 'claim'
        : url.pathname === `${endpoint}/update`
          ? 'update'
          : null;
    if (!action && url.pathname !== endpoint)
      return reply({ error: 'Not found.' }, 404);
    if (
      !env.STUDIO_DB ||
      !env.STUDIO_BROWSER_TOKEN ||
      !env.STUDIO_RUNNER_TOKEN
    ) {
      return reply(
        { error: 'Studio is waiting for its database and access secrets.' },
        503,
      );
    }
    const secret = action ? env.STUDIO_RUNNER_TOKEN : env.STUDIO_BROWSER_TOKEN;
    if (!(await authorized(request, secret)))
      return reply({ error: 'Invalid access key.' }, 401);
    try {
      return await (action
        ? runnerRequest(request, env.STUDIO_DB, action)
        : browserRequest(request, env.STUDIO_DB));
    } catch {
      return reply(
        {
          error:
            'Studio could not access its job queue. Check the Worker bindings and migration.',
        },
        503,
      );
    }
  },
};
