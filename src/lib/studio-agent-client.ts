interface Job {
  status: 'running' | 'failed' | 'review';
  previewStatus: string;
  prUrl: string | null;
  previewUrl: string | null;
  log: string;
}

const endpoint = '/api/studio-agent';
const form = document.querySelector<HTMLFormElement>('#agent-brief')!;
const button = document.querySelector<HTMLButtonElement>('#generate-draft')!;
const statusLabel = document.querySelector<HTMLElement>('#agent-status')!;
const error = document.querySelector<HTMLElement>('#agent-error')!;
const log = document.querySelector<HTMLElement>('#agent-log')!;
const logPanel =
  document.querySelector<HTMLDetailsElement>('#agent-log-panel')!;
const preview = document.querySelector<HTMLAnchorElement>('#agent-preview')!;
const pr = document.querySelector<HTMLAnchorElement>('#agent-pr')!;

let submitting = false;
let connected = false;
let hasConnected = false;

function link(anchor: HTMLAnchorElement, url: string | null) {
  anchor.hidden = !url;
  if (url) anchor.href = url;
  else anchor.removeAttribute('href');
}

function render(job: Job | null) {
  button.disabled = !connected || submitting || job?.status === 'running';
  const message =
    job?.status === 'running'
      ? 'Codex is building the draft and running the checks.'
      : job?.status === 'failed'
        ? 'The run failed. Open the run log for details.'
        : (job?.previewStatus ?? 'No campaign submitted yet.');
  if (statusLabel.textContent !== message) statusLabel.textContent = message;
  link(preview, job?.previewUrl ?? null);
  link(pr, job?.prUrl ?? null);
  logPanel.hidden = !job?.log;
  log.textContent = job?.log ?? '';
}

async function poll() {
  try {
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const { job } = await response.json();
    connected = true;
    hasConnected = true;
    if (!submitting) render(job);
  } catch {
    connected = false;
    button.disabled = true;
    statusLabel.textContent =
      'Start npm run studio:agent on your Mac and open http://127.0.0.1:4321/studio/generate/.';
  } finally {
    if (connected || hasConnected) window.setTimeout(poll, 2500);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  button.disabled = true;
  submitting = true;
  error.hidden = true;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const { job, error: message } = await response.json();
    if (!response.ok) throw new Error(message ?? 'Could not start Codex.');
    render(job);
  } catch (problem) {
    error.textContent =
      problem instanceof Error ? problem.message : 'Could not start Codex.';
    error.hidden = false;
    button.disabled = !connected;
  } finally {
    submitting = false;
  }
});

void poll();
