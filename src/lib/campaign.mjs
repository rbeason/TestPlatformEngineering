const limits = {
  slug: 50,
  eyebrow: 36,
  headline: 90,
  description: 240,
  ctaLabel: 32,
  ctaUrl: 512,
};

/**
 * @param {unknown} input
 * @returns {{ slug: string, eyebrow: string, headline: string, description: string, ctaLabel: string, ctaUrl: string }}
 */
export function validateCampaign(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Provide a campaign object.');
  }

  const campaign = /** @type {Record<keyof typeof limits, string>} */ ({});

  for (const key of /** @type {(keyof typeof limits)[]} */ (
    Object.keys(limits)
  )) {
    const raw = /** @type {Record<string, unknown>} */ (input)[key];
    if (
      typeof raw !== 'string' ||
      !raw.trim() ||
      raw.trim().length > limits[key]
    ) {
      throw new Error(`${key} must contain 1–${limits[key]} characters.`);
    }
    campaign[key] = raw.trim();
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(campaign.slug)) {
    throw new Error(
      'Page slug must use lowercase letters, numbers, and single hyphens.',
    );
  }
  if (!/^https:\/\//i.test(campaign.ctaUrl) || /[\s\\]/.test(campaign.ctaUrl)) {
    throw new Error('CTA destination must be an HTTPS URL.');
  }
  const destination = new globalThis.URL(campaign.ctaUrl);
  if (destination.username || destination.password) {
    throw new Error('CTA destination must not include credentials.');
  }

  return campaign;
}
