import sample from '../campaigns/campaign-kickoff.json';
import { validateCampaign } from './campaign.mjs';

type Campaign = ReturnType<typeof validateCampaign>;
type Status = 'draft' | 'in-review' | 'changes-requested' | 'approved';
type Role = 'marketer' | 'reviewer';

const storageKey = 'campaign-studio-v1';
const labels: Record<Status, string> = {
  draft: 'Draft',
  'in-review': 'In review',
  'changes-requested': 'Changes requested',
  approved: 'Approved',
};
const fields = Object.keys(sample) as (keyof Campaign)[];
const initial = { ...sample, slug: 'new-campaign' };
let campaign = initial;
let status: Status = 'draft';
let feedback = '';
let role: Role = 'marketer';

try {
  const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  if (
    saved &&
    fields.every((key) => typeof saved.campaign?.[key] === 'string') &&
    Object.hasOwn(labels, saved.status) &&
    typeof saved.feedback === 'string'
  ) {
    campaign = saved.campaign;
    status = saved.status;
    feedback = saved.feedback;
  }
} catch {
  // The demo also works when browser storage is unavailable.
}

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing studio element: ${id}`);
  return node as T;
}

const form = element<HTMLFormElement>('campaign-form');
const review = element<HTMLFormElement>('review-form');
const note = element<HTMLTextAreaElement>('review-note');
const error = element('studio-error');
const preview = element('campaign-preview');
const roleButtons = document.querySelectorAll<HTMLButtonElement>('[data-role]');

function persist() {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ campaign, status, feedback }),
    );
  } catch {
    // Keep this session usable even without local persistence.
  }
}

function showError(message = '') {
  error.textContent = message;
  error.hidden = !message;
}

function renderPreview() {
  for (const node of preview.querySelectorAll<HTMLElement>('[data-copy]')) {
    const key = node.dataset.copy as keyof Campaign;
    node.textContent = campaign[key] || sample[key];
  }
  element('page-path').textContent = `/lp/${campaign.slug || 'page-slug'}/`;
}

function render() {
  const marketer = role === 'marketer';
  const editable = status === 'draft' || status === 'changes-requested';
  form.hidden = !marketer;
  review.hidden = marketer;
  element<HTMLFieldSetElement>('editor-fields').disabled = !editable;
  element('submit-campaign').hidden = !editable;
  element('review-fields').hidden = status !== 'in-review';
  element('review-instructions').textContent =
    status === 'in-review'
      ? 'Review the preview and check both widths before making a decision.'
      : 'A submitted draft will appear here for review.';
  element('campaign-status').textContent = labels[status];
  element('workspace-title').textContent = marketer
    ? 'Campaign details'
    : 'Review campaign';
  element('review-feedback').textContent = feedback
    ? `Review note: ${feedback}`
    : '';
  element('review-feedback').hidden = !feedback;
  element('handoff').hidden = editable;
  element('new-draft').hidden = !marketer || status !== 'approved';
  for (const button of roleButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.role === role));
  }
  for (const key of fields) {
    const input = form.elements.namedItem(key) as
      HTMLInputElement | HTMLTextAreaElement;
    input.value = campaign[key];
  }
  renderPreview();
}

form.addEventListener('input', () => {
  const data = new FormData(form);
  campaign = Object.fromEntries(
    fields.map((key) => [key, String(data.get(key) ?? '')]),
  ) as Campaign;
  showError();
  persist();
  renderPreview();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (
    role !== 'marketer' ||
    (status !== 'draft' && status !== 'changes-requested')
  )
    return;
  try {
    campaign = validateCampaign(campaign);
    status = 'in-review';
    feedback = '';
    showError();
    persist();
    render();
  } catch (problem) {
    showError(
      problem instanceof Error
        ? problem.message
        : 'Check the campaign details.',
    );
  }
});

function decide(next: 'approved' | 'changes-requested') {
  if (role !== 'reviewer' || status !== 'in-review') return;
  const message = note.value.trim();
  if (next === 'changes-requested' && !message) {
    showError('Add a review note so the marketer knows what to change.');
    note.focus();
    return;
  }
  feedback = message;
  note.value = '';
  status = next;
  showError();
  persist();
  render();
}

review.addEventListener('submit', (event) => {
  event.preventDefault();
  decide('approved');
});
element('request-changes').addEventListener('click', () =>
  decide('changes-requested'),
);

for (const button of roleButtons) {
  button.addEventListener('click', () => {
    role = button.dataset.role === 'reviewer' ? 'reviewer' : 'marketer';
    showError();
    render();
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-size]',
)) {
  button.addEventListener('click', () => {
    preview.dataset.width = button.dataset.size;
    for (const choice of document.querySelectorAll('[data-size]')) {
      choice.setAttribute('aria-pressed', String(choice === button));
    }
  });
}

element('download-campaign').addEventListener('click', () => {
  const data = new Blob([JSON.stringify(campaign, null, 2) + '\n'], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${campaign.slug}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});

element('new-draft').addEventListener('click', () => {
  status = 'draft';
  feedback = '';
  persist();
  render();
});

render();
