import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import console from 'node:console';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { findPreview, prPattern } from '../src/lib/studio-jobs.mjs';

const exec = promisify(execFile);
const endpoint =
  'https://testplatformengineering.eason-bryce.workers.dev/api/studio-agent';
const cwd = fileURLToPath(new globalThis.URL('../', import.meta.url));
const token = process.env.STUDIO_RUNNER_TOKEN;
const childEnv = { ...process.env };
delete childEnv.STUDIO_RUNNER_TOKEN;

async function call(action, payload) {
  for (let attempt = 1; ; attempt++) {
    let failure;
    try {
      const response = await globalThis.fetch(`${endpoint}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: globalThis.AbortSignal.timeout(15_000),
        redirect: 'error',
      });
      if (response.ok) return await response.json();
      failure = new Error(
        `Studio ${action}: ${response.status} ${(await response.json()).error}`,
      );
      if (response.status < 500 && response.status !== 409) {
        failure.permanent = true;
      }
    } catch (error) {
      failure = error;
    }
    if (failure.permanent || attempt === 4) throw failure;
    await wait(attempt * 2000);
  }
}

async function runCodex(job) {
  const temp = await mkdtemp(join(tmpdir(), 'studio-agent-'));
  try {
    const resultPath = join(temp, 'pr-url');
    const task = [
      `Create a new marketing landing page at /lp/${job.slug}/ in src/pages/lp/${job.slug}/index.astro.`,
      'Use Astro and Tailwind. Follow AGENTS.md and apply relevant locally available skills.',
      `Keep page code in src/pages/lp/${job.slug}/, assets in public/campaigns/${job.slug}/, and tests in tests/browser/campaign-${job.slug}.spec.mjs. Cover desktop and mobile.`,
      'Preserve the Studio, shared checks, other campaigns, and deployment configuration.',
      'Use the following creative brief for the page.',
      '',
      job.prompt,
    ].join('\n');

    const child = spawn('bash', ['scripts/agent-pr.sh', task], {
      cwd,
      env: {
        ...childEnv,
        STUDIO_GENERATED_SLUG: job.slug,
        STUDIO_PR_RESULT: resultPath,
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (exitCode) => resolve(exitCode));
    });

    const url = (await readFile(resultPath, 'utf8').catch(() => '')).trim();
    if (prPattern.test(url)) return url;
    if (code !== 0) throw new Error(`Agent workflow exited with code ${code}.`);
    throw new Error(
      'The agent workflow completed without creating a draft PR.',
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

async function waitForPreview(job, claim, prUrl) {
  await call('update', {
    id: job.id,
    claim,
    status: 'previewing',
    prUrl,
    message: 'Draft PR opened. Waiting for Cloudflare to post the preview.',
  });
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    try {
      const { stdout } = await exec(
        'gh',
        ['pr', 'view', prUrl, '--json', 'comments,statusCheckRollup'],
        { cwd, env: childEnv, timeout: 15_000, maxBuffer: 2_000_000 },
      );
      const { comments, statusCheckRollup } = JSON.parse(stdout);
      const previewUrl = findPreview(comments, job.slug);
      const failed = statusCheckRollup.some(
        (check) =>
          /cloudflare|workers builds/i.test(
            check.name ?? check.context ?? '',
          ) &&
          /FAILURE|ERROR|TIMED_OUT/i.test(
            check.conclusion ?? check.state ?? '',
          ),
      );
      if (previewUrl || failed) {
        await call('update', {
          id: job.id,
          claim,
          status: 'review',
          prUrl,
          previewUrl,
          message: previewUrl
            ? 'Preview ready.'
            : 'Cloudflare build failed. Open the PR for its build log.',
        });
        return;
      }
    } catch (error) {
      console.error(error.message);
    }
    await wait(12_000);
  }
  await call('update', {
    id: job.id,
    claim,
    status: 'review',
    prUrl,
    message:
      'Cloudflare has not posted a preview yet. Check the PR for updates.',
  });
}

async function main() {
  if (!token || token.length < 32)
    throw new Error('Set STUDIO_RUNNER_TOKEN before starting the Mac runner.');
  const { stdout } = await exec(
    'gh',
    ['api', 'user', '--hostname', 'github.com', '--jq', '.login'],
    {
      cwd,
      env: childEnv,
      timeout: 15_000,
    },
  );
  if (stdout.trim() !== 'rbeason')
    throw new Error('Sign in to GitHub CLI as rbeason.');
  await exec('codex', ['login', 'status'], {
    cwd,
    env: childEnv,
    timeout: 15_000,
  });
  console.log(
    'Waiting for campaign jobs from Cloudflare. Press Ctrl+C to stop.',
  );

  for (;;) {
    const claim = randomUUID();
    const { job } = await call('claim', { claim });
    if (!job) {
      await wait(8000);
      continue;
    }

    console.log(`Generating /lp/${job.slug}/`);
    let prUrl;
    try {
      prUrl = await runCodex(job);
    } catch (error) {
      console.error(error.message);
      await call('update', {
        id: job.id,
        claim,
        status: 'failed',
        message:
          'Codex could not create a verified draft PR. See the Mac runner terminal for details.',
      });
      continue;
    }
    await waitForPreview(job, claim, prUrl);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
