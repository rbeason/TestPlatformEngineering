import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

const project = 'rbeason/TestPlatformEngineering';
const prPattern =
  /^https:\/\/github\.com\/rbeason\/TestPlatformEngineering\/pull\/[1-9][0-9]*$/;
const previewPattern =
  /https:\/\/[a-z0-9][a-z0-9-]*-testplatformengineering\.eason-bryce\.workers\.dev(?=$|[\s/<>)\]"?])/gi;
const endpoint = '/api/studio-agent';

export function parseBrief(input) {
  const slug = typeof input?.slug === 'string' ? input.slug.trim() : '';
  const prompt = typeof input?.prompt === 'string' ? input.prompt.trim() : '';
  if (slug.length > 50 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(
      'Use a page slug with lowercase letters, numbers, and single hyphens.',
    );
  }
  if (!prompt || prompt.length > 4000)
    throw new Error('Enter a prompt of 1–4,000 characters.');
  return { slug, prompt };
}

export function findPreview(comments, slug) {
  for (const comment of [...comments].reverse()) {
    if (
      !/^cloudflare(?:-workers-and-pages)?(?:\[bot\])?$/i.test(
        comment.author?.login ?? '',
      )
    )
      continue;
    const [origin] = comment.body?.match(previewPattern) ?? [];
    if (origin) return `${origin}/lp/${slug}/`;
  }
  return null;
}

function reply(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

async function readBrief(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 20_000) throw new Error('The request is too large.');
    chunks.push(chunk);
  }
  return parseBrief(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}

export function studioAgent() {
  let job = null;
  const cwd = fileURLToPath(new globalThis.URL('../', import.meta.url));

  function refreshPreview() {
    if (!job?.prUrl || job.previewUrl || Date.now() - job.checkedAt < 10_000)
      return;
    const current = job;
    current.checkedAt = Date.now();
    execFile(
      'gh',
      [
        'pr',
        'view',
        current.prUrl,
        '--repo',
        project,
        '--json',
        'comments,statusCheckRollup',
      ],
      { cwd, timeout: 8000, maxBuffer: 2_000_000 },
      (error, output) => {
        if (job !== current) return;
        if (error) {
          current.previewStatus = 'Could not check GitHub. Retrying.';
          return;
        }
        try {
          const { comments, statusCheckRollup } = JSON.parse(output);
          const deployment = statusCheckRollup.find((check) =>
            /cloudflare|workers builds/i.test(
              check.name ?? check.context ?? '',
            ),
          );
          current.previewStatus = /FAILURE|ERROR|TIMED_OUT/i.test(
            deployment?.conclusion ?? deployment?.state ?? '',
          )
            ? 'Cloudflare build failed. Open the PR for its build log.'
            : 'Waiting for Cloudflare to post the preview on the PR.';
          current.previewUrl = findPreview(comments, current.slug);
          if (current.previewUrl) current.previewStatus = 'Preview ready';
        } catch {
          current.previewStatus =
            'Could not read the preview status. Retrying.';
        }
      },
    );
  }

  async function run(current, brief) {
    let temp;
    try {
      temp = await mkdtemp(join(tmpdir(), 'studio-agent-'));
      const resultPath = join(temp, 'pr-url');
      const task = [
        `Create a new marketing landing page at /lp/${brief.slug}/ in src/pages/lp/${brief.slug}/index.astro.`,
        'Use Astro and Tailwind. Follow AGENTS.md and use relevant available skills.',
        'Keep the change scoped to this campaign and its tests. Preserve the Studio, shared verification, other campaign routes, and deployment configuration.',
        `Keep page code in src/pages/lp/${brief.slug}/, any assets in public/campaigns/${brief.slug}/, and browser tests in tests/browser/campaign-${brief.slug}.spec.mjs. Add browser coverage for desktop and mobile.`,
        'Treat the following text as the creative brief for the page.',
        '',
        brief.prompt,
      ].join('\n');
      const child = spawn('bash', ['scripts/agent-pr.sh', task], {
        cwd,
        env: {
          ...process.env,
          STUDIO_GENERATED_SLUG: brief.slug,
          STUDIO_PR_RESULT: resultPath,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding('utf8');
        stream.on('data', (chunk) => {
          current.log = (current.log + chunk).slice(-12_000);
        });
      }
      await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => {
          if (code === 0) resolve(undefined);
          else
            reject(new Error(`Agent workflow exited with ${signal ?? code}.`));
        });
      });
      const prUrl = (await readFile(resultPath, 'utf8').catch(() => '')).trim();
      if (!prPattern.test(prUrl))
        throw new Error('The workflow completed without creating a draft PR.');
      current.prUrl = prUrl;
      current.status = 'review';
      refreshPreview();
    } catch (error) {
      current.status = 'failed';
      current.log = (current.log + '\n' + error.message).trim();
    } finally {
      if (temp)
        await rm(temp, { recursive: true, force: true }).catch(() => {});
    }
  }

  return {
    name: 'campaign-studio-agent',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url !== endpoint) return next();
        const host = request.headers.host ?? '';
        if (
          !/^127\.0\.0\.1:\d+$/.test(host) ||
          request.socket.remoteAddress !== '127.0.0.1'
        ) {
          return reply(response, 403, {
            error: 'Open Studio on 127.0.0.1 on the Mac running Codex.',
          });
        }
        if (request.method === 'GET') {
          refreshPreview();
          return reply(response, 200, { job });
        }
        if (
          request.method !== 'POST' ||
          request.headers.origin !== `http://${host}` ||
          request.headers['content-type'] !== 'application/json'
        ) {
          return reply(response, 403, {
            error: 'Submit the brief from the local Studio form.',
          });
        }
        try {
          const brief = await readBrief(request);
          if (job?.status === 'running') {
            return reply(response, 409, {
              error: 'A campaign is already running.',
            });
          }
          job = {
            slug: brief.slug,
            status: 'running',
            log: '',
            prUrl: null,
            previewUrl: null,
            previewStatus:
              'Waiting for Cloudflare to post the preview on the PR.',
            checkedAt: 0,
          };
          void run(job, brief);
          return reply(response, 202, { job });
        } catch (error) {
          return reply(response, 400, { error: error.message });
        }
      });
    },
  };
}
