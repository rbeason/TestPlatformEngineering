interface Job {
  status: 'queued' | 'running' | 'previewing' | 'failed' | 'review';
  message: string;
  prUrl: string | null;
  previewUrl: string | null;
}

const endpoint = '/api/studio-agent';
const unlock = document.querySelector<HTMLFormElement>('#studio-unlock')!;
const key = document.querySelector<HTMLInputElement>('#studio-access-key')!;
const form = document.querySelector<HTMLFormElement>('#agent-brief')!;
const button = document.querySelector<HTMLButtonElement>('#generate-draft')!;
const statusLabel = document.querySelector<HTMLElement>('#agent-status')!;
const error = document.querySelector<HTMLElement>('#agent-error')!;
const preview = document.querySelector<HTMLAnchorElement>('#agent-preview')!;
const pr = document.querySelector<HTMLAnchorElement>('#agent-pr')!;

let token = '';
let unlocked = false;
let busy = false;
let submitting = false;

function link(anchor: HTMLAnchorElement, url: string | null) {
  anchor.hidden = !url;
  if (url) anchor.href = url;
  else anchor.removeAttribute('href');
}

function render(job: Job | null) {
  busy = !!job && ['queued', 'running', 'previewing'].includes(job.status);
  button.disabled = !unlocked || busy || submitting;
  const message = job?.message ?? 'No campaign submitted yet.';
  if (statusLabel.textContent !== message) statusLabel.textContent = message;
  link(preview, job?.previewUrl ?? null);
  link(pr, job?.prUrl ?? null);
}

function showError(problem: unknown) {
  error.textContent =
    problem instanceof Error ? problem.message : 'Studio could not connect.';
  error.hidden = false;
}

async function jobs(
  payload?: Record<string, FormDataEntryValue>,
): Promise<Job | null> {
  const response = await fetch(endpoint, {
    method: payload ? 'POST' : 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(payload && { 'Content-Type': 'application/json' }),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (response.status === 401) {
    token = '';
    unlocked = false;
    form.hidden = true;
    unlock.hidden = false;
    render(null);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(result?.error ?? 'Open the Cloudflare-hosted Studio.');
  return result.job;
}

async function poll() {
  if (unlocked && !submitting) {
    try {
      const job = await jobs();
      if (!submitting) render(job);
    } catch (problem) {
      showError(problem);
    }
  }
  if (unlocked) window.setTimeout(poll, 5000);
}

unlock.addEventListener('submit', async (event) => {
  event.preventDefault();
  token = key.value.trim();
  error.hidden = true;
  try {
    const job = await jobs();
    unlocked = true;
    key.value = '';
    unlock.hidden = true;
    form.hidden = false;
    render(job);
    window.setTimeout(poll, 5000);
  } catch (problem) {
    showError(problem);
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  submitting = true;
  button.disabled = true;
  error.hidden = true;
  try {
    const job = await jobs(Object.fromEntries(new FormData(form)));
    render(job);
  } catch (problem) {
    showError(problem);
  } finally {
    submitting = false;
    button.disabled = !unlocked || busy;
  }
});
