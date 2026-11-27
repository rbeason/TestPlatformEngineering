#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ [^[:space:]] ]]; then
  printf 'Usage: bash scripts/agent-pr.sh "Describe the change and acceptance criteria."\n' >&2
  exit 2
fi

for command in git gh codex node npm; do
  command -v "$command" >/dev/null || { printf 'Missing command: %s\n' "$command" >&2; exit 1; }
done

cd "$(dirname "${BASH_SOURCE[0]}")/.."
repo='rbeason/TestPlatformEngineering'
base=main
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "$(cat .nvmrc)" ]]; then
  printf 'Use Node %s from .nvmrc before starting a task.\n' "$(cat .nvmrc)" >&2
  exit 1
fi
if [[ "$(gh api user --hostname github.com --jq .login)" != rbeason ]]; then
  printf 'Sign in to GitHub CLI as rbeason before starting a task.\n' >&2
  exit 1
fi

case "$(git remote get-url --push origin)" in
  "git@github.com:$repo.git" | "ssh://git@ssh.github.com:443/$repo.git") ;;
  *) printf 'The origin push URL must use SSH for %s.\n' "$repo" >&2; exit 1 ;;
esac

git fetch origin "refs/heads/$base"
base_commit=$(git rev-parse FETCH_HEAD)
task_dir=$(mktemp -d "${TMPDIR:-/tmp}/devprod-task.XXXXXXXX")
task_id=${task_dir##*.}
branch="agent/task-$task_id"
worktree="$task_dir/worktree"
git worktree add -b "$branch" "$worktree" "$base_commit"

trap 'printf "\nTask stopped. Inspect %s on branch %s.\n" "$worktree" "$branch" >&2' ERR
remove_task_worktree() {
  cd "$task_dir"
  git -C "$worktree" worktree remove --force "$worktree"
  cd ..
  rmdir "$task_dir"
}

cd "$worktree"
npm ci
npx playwright install chromium

{
  cat <<'PROMPT'
Implement the task below in this Astro and Tailwind repository. Follow AGENTS.md.
Add or update tests for changed behavior and run npm run verify. If your sandbox
blocks the preview server or Chromium, report that so the wrapper can run that check.
Leave your edits in this worktree. The wrapper will verify, commit, push, and open
a draft PR after you finish.

Task
PROMPT
  printf '%s\n' "$1"
} | codex --ask-for-approval never exec --sandbox workspace-write -

if [[ "$(git rev-parse HEAD)" != "$base_commit" || "$(git branch --show-current)" != "$branch" ]]; then
  printf 'The agent changed Git history. Inspect %s before publishing.\n' "$worktree" >&2
  exit 1
fi
if [[ -z "$(git status --porcelain)" ]]; then
  printf 'No changes to publish.\n'
  remove_task_worktree
  exit 0
fi

# Reinstall from the proposed lockfile so the gate matches a clean CI checkout.
npm ci
npx playwright install chromium
npm run verify
git add -A
git commit -m "Implement agent task $task_id"
git push origin "HEAD:refs/heads/$branch"
gh pr create --repo "$repo" --base "$base" --head "$branch" --draft \
  --title "Agent task $task_id" \
  --body 'Changes prepared by Codex in an isolated worktree. Local verification passed with `npm run verify`. See Files changed and the CI browser report before merging.'

# Keep the branch on GitHub. Discard generated files from this temporary checkout.
remove_task_worktree
