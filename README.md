# DevProd lab

This lab takes a Python change from a fresh Codespace to a tested pull request. Run the same test command as a developer, in GitHub Actions, and when asking a coding agent to investigate a failed check.

## What this automates

The folder started with only `AGENTS.md`. These were the workflow gaps in order of priority.

| Friction | Automation |
| --- | --- |
| A new workspace had no runtime or first check. | The dev container selects Python 3.13 and runs the tests on creation. |
| An unattended workspace can consume the free quota. | GitHub stops it after a five-minute idle timeout configured on your account or at creation. Stop it explicitly when you finish. |
| A pull request had no repeatable verification. | GitHub Actions runs the same test command on PRs and pushes to `main`. New runs cancel older runs for the same ref, and the job has a five-minute limit. |
| An agent had no failure reproduction command or handoff. | Give it the failing test and CI output, have it rerun the suite, and review the proposed change. |

**Platform engineering** provides the reusable environment and CI capabilities. The **golden path** is the documented route you can take from opening the workspace to getting a verified PR. **Agentic CI/CD** can add an agent where diagnosis or repair requires judgment. Stripe describes giving its Minions the same type of devbox its engineers use, running checks deterministically, and limiting CI repair attempts before handing control back to a person. In this lab, the dev container plays the role of the devbox and Actions runs the checks. [Stripe's Minions write-up](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) · [Stripe's workflow and retry design](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2)

## 1. Publish with your personal GitHub account and SSH key

Sign in to GitHub as `rbeason` and create an empty private repository named `TestPlatformEngineering`. Leave the README, license, and gitignore initialization options unchecked. Use the path to your existing personal key in both commands below.

From this folder on your Mac, verify that GitHub greets you with **Hi rbeason!**. GitHub returns status 1 after a successful SSH authentication test. [Testing SSH](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection)

```sh
ssh -T -o IdentitiesOnly=yes -i ~/.ssh/YOUR_PERSONAL_KEY git@github.com
```

For the initial setup, configure Git to use that key for this repository and push the lab.

```sh
git init -b main
git config --local core.sshCommand 'ssh -o IdentitiesOnly=yes -i ~/.ssh/YOUR_PERSONAL_KEY'
git add AGENTS.md README.md .gitignore .devcontainer .github devprod_lab tests
git commit -m "Set up DevProd lab"
git remote add origin git@github.com:rbeason/TestPlatformEngineering.git
git push -u origin main
```

The SSH setting lives in this checkout's Git configuration. Keep the private key on your Mac. Inside Codespaces, GitHub supplies credentials scoped to the repository. [GitHub Codespaces authentication](https://docs.github.com/en/codespaces/reference/security-in-github-codespaces)

## 2. Create a Codespace with automatic idle shutdown

1. While signed in as `rbeason`, open **Settings → Codespaces**. Set **Default idle timeout** to **5 minutes** and save. The setting applies to newly created Codespaces. Closing a browser tab leaves the Codespace running until it stops, and terminal output can reset the idle timer. [GitHub idle timeout settings](https://docs.github.com/en/codespaces/setting-your-user-preferences/setting-your-timeout-period-for-github-codespaces)
2. Open the repository and choose **Code → Codespaces**. Use the creation options to select `main` and a **2-core** machine. The lab uses the default Codespaces Linux image with a Python feature. Keep prebuilds disabled for this lab. [Creating a Codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/creating-a-codespace-for-a-repository) · [Included usage](https://docs.github.com/en/codespaces/troubleshooting/troubleshooting-included-usage)
3. When you finish, save your work and run **Codespaces: Stop Codespace** from the VS Code Command Palette, or stop it from the menu on the Codespaces dashboard. Confirm it shows as stopped. [Stopping and starting a Codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/stopping-and-starting-a-codespace) · [Codespaces dashboard](https://github.com/codespaces)

GitHub Free for personal accounts includes **120 core-hours** and **15 GB-month** of storage per month. On a 2-core machine, that is up to **60 hours of active time** if storage lasts. A stopped Codespace uses storage until it is deleted. Push work you want to keep before deleting a Codespace you no longer need. With no valid payment method, GitHub blocks usage after the included quota is exhausted. If you have one on file, review your Codespaces budget and enable the stop-usage setting for your spending limit. [Codespaces billing](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces) · [GitHub budgets](https://docs.github.com/en/billing/how-tos/set-up-budgets)

If you prefer the CLI, run the following on your Mac. GitHub CLI uses an API login for Codespaces. Switch to `rbeason` if that account is already logged in, or use `gh auth login` and select it in the browser. Check that the second command prints `rbeason` before creating the Codespace.

```sh
gh auth switch --hostname github.com --user rbeason
gh api user --jq .login
gh codespace create --repo rbeason/TestPlatformEngineering --branch main --idle-timeout 5m
```

Choose the 2-core option if prompted. Use the name returned by the CLI in these commands. Run the stop command at the end of the session.

```sh
gh codespace code --web --codespace CODESPACE_NAME
gh codespace stop --codespace CODESPACE_NAME
gh codespace list --repo rbeason/TestPlatformEngineering
```

## 3. Run the golden path

Use Python **3.13** and run all commands from the root of this repository, either locally or in Codespaces. The sample uses the standard library and runs directly from source, so there are no dependency install or build steps.

```sh
python3 --version
python3 -m devprod_lab.usage 2 30
python3 -m unittest -v
python3 -m unittest -v tests.test_usage.CoreMinutesTests.test_returns_zero_for_no_active_time
```

The sample prints `60 core-minutes (1.00 core-hours)`. The third command is what the dev container and CI both run.

- `devprod_lab/` contains the sample command-line application.
- `tests/` contains unit tests. There are no fixtures or assets.
- `.devcontainer/devcontainer.json` defines the Codespaces runtime and initial check.
- `.github/workflows/ci.yml` runs the check on a GitHub-hosted runner. Your Codespace can stay stopped while CI finishes.

## 4. Practice agent-assisted CI triage

On a practice branch, change the multiplication in `devprod_lab/usage.py` to addition, push the branch, and open a draft PR. Stop the Codespace and watch the check from the PR. The failure should show which input produced a result different from the test expectation.

Give your coding agent the failed test output and this task.

> Reproduce the failure with `python3 -m unittest -v`. Explain the root cause and propose a minimal fix that preserves the tested behavior. Run the suite again and show me the diff and test output for review.

Review the patch, push it yourself, and confirm the next CI run passes. Record the time from Codespace creation to the first green check and the time from CI failure to reproduction. Repeat the exercise after changing one part of the workflow to see whether the change saves time. The workflow uses a read-only repository token. Agent execution is a manual exercise, and the lab ends at a verified PR.
