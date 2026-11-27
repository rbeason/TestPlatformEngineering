# Astro and Tailwind DevProd lab

The golden path is a Node 26 workspace, one verification command, and a draft pull request with the diff and browser results. It borrows Stripe's pattern of giving people and agents a standard environment and putting deterministic checks around the agent's work. [Stripe's Minions workflow](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2)

## Set up and run

Run these commands from the repository root on your Mac or in Codespaces. Node 26 is declared in `.nvmrc`. If you use nvm, run `nvm install` and `nvm use` from the root.

```sh
npm ci
npx playwright install chromium
npm run dev -- --host 0.0.0.0
```

On Linux, install Chromium and its system dependencies with `npx playwright install --with-deps chromium`. Codespaces installs those for you on creation. Open the forwarded port **4321** in Codespaces or `http://localhost:4321` on your Mac.

| Command                | What it checks                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | ESLint on JavaScript and test files                                                                                   |
| `npm run format:check` | Prettier on supported files. Run `npm run format` to apply changes.                                                   |
| `npm run check`        | Astro template and TypeScript diagnostics                                                                             |
| `npm run build`        | Generates the production Astro site and Tailwind CSS in `dist/`                                                       |
| `npm test`             | Checks the built homepage and compiled CSS                                                                            |
| `npm run test:browser` | Tests the built site in Chromium at desktop and mobile sizes, checks accessibility with axe, and captures screenshots |
| `npm run verify`       | Runs all of the above in order and stops at the first failure                                                         |

Run one smoke test after building with `node --test --test-name-pattern="compiled Tailwind" tests/site.test.mjs`. Run one browser project after building with `npm run test:browser -- --project=mobile`.

- `src/pages/` contains the Astro page. `src/styles/` contains the Tailwind entry point.
- `tests/` contains build smoke tests and `tests/browser/` contains Playwright tests. The tests use the built site as input.
- `.devcontainer/` sets up Codespaces. `.github/workflows/` sets up CI and the optional GitHub-hosted agent.

## One prompt to a draft PR

Publish this setup to the default branch of `rbeason/TestPlatformEngineering` before starting an agent task. Both routes below start from GitHub's `main` and leave the merge to you.

### Run from your Mac with Codex

Use the Codex CLI signed into your existing account, GitHub CLI signed in as `rbeason`, Node 26, and the existing GitHub SSH key. Verify your two GitHub identities once. GitHub uses the SSH key for Git pushes and the `gh` login for creating draft PRs.

```sh
ssh -T -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 git@github.com
git config --local core.sshCommand 'ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519'
gh auth switch --hostname github.com --user rbeason
gh api user --hostname github.com --jq .login
```

Look for `Hi rbeason!` and `rbeason` respectively. If `gh` has no saved login for that account, sign in first with `gh auth login`. Then give the wrapper one prompt from the repository root.

```sh
bash scripts/agent-pr.sh 'Add a short Getting started section below the verification card. Keep it readable at mobile widths and update the relevant browser test.'
```

The wrapper creates a fresh Git worktree, installs dependencies, runs Codex, and independently runs `npm run verify` before committing and pushing an `agent/` branch. It prints the draft PR URL when done. If verification fails, it prints the retained worktree path so you can inspect the failure and generated reports. This route uses your Mac and your existing Codex access while Codespaces stays stopped.

### Run in GitHub's cloud

With a paid Copilot plan and cloud agent access, run the prompt directly from any terminal with a signed-in GitHub CLI. Copilot provisions the runner, uses the checked-in setup workflow, and works in a draft PR. It runs separately from your Codespaces allowance and can use GitHub Actions and Copilot allowances. [GitHub cloud agent CLI](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-from-cli) · [Agent setup workflow](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment)

```sh
gh agent-task create --repo rbeason/TestPlatformEngineering --base main \
  'Add a short Getting started section below the verification card. Keep it readable at mobile widths and update the relevant browser test.'
```

## Review the result and merge

1. Open the PR and review **Files changed**, especially changes to tests and CI configuration. On a Copilot PR, use **Approve and run workflows** if GitHub prompts you. [Copilot workflow approval](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/configuring-agent-settings)
2. Open **Checks → Verify Astro site** for the logs. When the browser stage runs, its Actions run has a **browser-report** artifact with desktop and mobile screenshots, results, and traces for browser failures. Download and extract it, then run `npx playwright show-report /path/to/extracted-report` from the repository root. For an interactive preview, check out the PR and run `npm ci` and `npm run dev`. [Playwright CI reports](https://playwright.dev/docs/ci-intro)
3. Once the check passes and you are happy with the result, click **Ready for review**, then **Squash and merge**. Formal approval and merge are separate GitHub actions. For a private repository on GitHub Free, use the green check as your manual merge gate. If your GitHub plan supports private branch protection, require **Verify Astro site** on `main` to enforce the gate. [Protected branch availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)

## Keep Codespaces usage low

- While signed in as `rbeason`, set **Settings → Codespaces → Default idle timeout** to **5 minutes** before creating the Codespace. Use a **2-core** machine and leave prebuilds off. [Codespaces idle timeout](https://docs.github.com/en/codespaces/setting-your-user-preferences/setting-your-timeout-period-for-github-codespaces)
- Save your work and choose **Codespaces: Stop Codespace** in the Command Palette at the end of a session. A running development server can emit output and reset the idle timer. GitHub-hosted CI and either agent route can run with your Codespace stopped. [Codespaces dashboard](https://github.com/codespaces)
- GitHub Free includes **120 core-hours** and **15 GB-month** of Codespaces storage per month. That is up to **60 active hours on a 2-core machine**. Stopped machines continue to use storage, including downloaded browser binaries. Push your work before deleting a Codespace you no longer need. [Codespaces billing](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces)

## Try Campaign Studio

Run `npm ci` and `npm run dev` from the repository root. Open [Campaign Studio](http://localhost:4321/studio/) or use the link on the DevProd homepage.

1. As **Marketer**, edit the campaign copy and use the **Desktop** and **Mobile** preview widths. Choose a unique page slug and submit the draft.
2. Switch to **Reviewer**. Request changes with a note, switch back to revise and resubmit, then approve the revision.
3. For a real PR, download the JSON after submitting and run the command below from your Mac. Merge this prototype into GitHub's `main` first and use the same `rbeason` SSH and GitHub CLI setup as the agent script.

```sh
npm run campaign:pr -- ~/Downloads/new-campaign.json
```

The demo stores one draft and its review status in browser storage. The role buttons simulate the two roles on one device. For real publishing, the command validates the JSON, creates a branch with only the content file, builds and smoke-tests it, and opens a draft PR. The GitHub merge is the publishing decision. The static editor stores no GitHub credentials and has no shared team sign-in or cross-device draft storage.

Campaign data lives in `src/campaigns/`. The editor and published pages share `src/components/CampaignHero.astro`. A sample publishes at `/lp/campaign-kickoff/`. To run the new tests independently, build first, then use `node --test tests/campaign.test.mjs` or `npm run test:browser -- studio.spec.mjs --project=desktop`.

## Cloudflare Worker previews and publishing

In the Cloudflare dashboard, open **Workers & Pages → testplatformengineering → Settings → Builds**. The Git repository should be `rbeason/TestPlatformEngineering`. Use these settings. [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

| Setting               | Value                                |
| --------------------- | ------------------------------------ |
| Production branch     | `main`                               |
| Root directory        | `/`                                  |
| Build command         | `npm run build`                      |
| Deploy command        | `npx --yes wrangler@4.168.0 deploy`  |
| Enable Preview Builds | On                                   |
| Preview command       | `npx --yes wrangler@4.168.0 preview` |

Keep the default dependency installation. The build already picks up Node 26 from `.nvmrc`. The checked-in `wrangler.jsonc` connects the Worker to Astro’s static output in `dist`. If the dashboard offers **Set up Worker Previews**, complete that setup, then confirm the Preview command. Under **Domains**, keep the Preview Worker URL enabled. [Branch build controls](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/) · [Workers static assets](https://developers.cloudflare.com/workers/static-assets/binding/)

Open a PR from a branch in the connected repository. After a successful preview build, Cloudflare posts the Preview URL on the PR. Open it and append `/lp/<page-slug>/` to review the finished campaign. Another push updates that Preview. A merge to `main` triggers the production build and deploy. GitHub CI and Cloudflare builds run independently. [Worker Previews](https://developers.cloudflare.com/workers/previews/get-started/)

Preview URLs are public by default. The prototype stores drafts on your device. Enable Cloudflare Access on the preview and production hosts before using the app for private campaigns. [Worker Preview access](https://developers.cloudflare.com/workers/previews/configuration/)
