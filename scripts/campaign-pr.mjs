import { execFileSync } from 'node:child_process';
import console from 'node:console';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { validateCampaign } from '../src/lib/campaign.mjs';

const repo = 'rbeason/TestPlatformEngineering';
const root = fileURLToPath(new URL('../', import.meta.url));
const [file, ...extra] = process.argv.slice(2);

function run(command, args, cwd = root) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

function read(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim();
}

let worktree;
let temporary;
let added = false;
try {
  if (!file || extra.length)
    throw new Error('Usage: npm run campaign:pr -- /path/to/campaign.json');

  const page = validateCampaign(JSON.parse(readFileSync(file, 'utf8')));
  const origin = read('git', ['remote', 'get-url', 'origin']);
  const pushOrigin = read('git', ['remote', 'get-url', '--push', 'origin']);
  const permitted = [
    `git@github.com:${repo}.git`,
    `ssh://git@ssh.github.com:443/${repo}.git`,
  ];
  if (!permitted.includes(origin) || !permitted.includes(pushOrigin)) {
    throw new Error(`Set origin to the SSH URL for ${repo}.`);
  }
  if (
    read('gh', [
      'api',
      'user',
      '--hostname',
      'github.com',
      '--jq',
      '.login',
    ]) !== 'rbeason'
  ) {
    throw new Error('Sign in to GitHub CLI as rbeason first.');
  }

  run('git', ['fetch', 'origin', 'refs/heads/main']);
  temporary = mkdtempSync(join(tmpdir(), 'campaign-'));
  const branch = `marketing/${page.slug}-${temporary.slice(-6)}`;
  worktree = join(temporary, 'worktree');
  run('git', ['worktree', 'add', '-b', branch, worktree, 'FETCH_HEAD']);
  added = true;

  const contentFile = `src/campaigns/${page.slug}.json`;
  if (!existsSync(join(worktree, 'src/campaigns/campaign-kickoff.json'))) {
    throw new Error(
      'Merge the Campaign Studio setup into main before submitting a campaign.',
    );
  }
  if (existsSync(join(worktree, contentFile))) {
    throw new Error(
      'That page slug already exists on main. Choose a new page slug.',
    );
  }
  writeFileSync(
    join(worktree, contentFile),
    JSON.stringify(page, null, 2) + '\n',
    {
      flag: 'wx',
    },
  );

  run('npm', ['ci'], worktree);
  run('npm', ['run', 'build'], worktree);
  run('npm', ['test'], worktree);
  run('git', ['add', '--', contentFile], worktree);
  run('git', ['commit', '-m', `Add campaign ${page.slug}`], worktree);
  run('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], worktree);
  run(
    'gh',
    [
      'pr',
      'create',
      '--repo',
      repo,
      '--base',
      'main',
      '--head',
      branch,
      '--draft',
      '--title',
      `Add campaign: ${page.slug}`,
      '--body',
      `Review \`/lp/${page.slug}/\` on the Cloudflare Worker Preview posted on this PR. Local build and smoke tests passed.`,
    ],
    worktree,
  );

  run('git', ['worktree', 'remove', '--force', worktree]);
  rmdirSync(temporary);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (added)
    console.error(`The campaign worktree is available at ${worktree}.`);
  else if (temporary) rmdirSync(temporary);
  process.exitCode = 1;
}
