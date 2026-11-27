export const prPattern =
  /^https:\/\/github\.com\/rbeason\/TestPlatformEngineering\/pull\/[1-9][0-9]*$/;
export const previewPattern =
  /https:\/\/[a-z0-9][a-z0-9-]*-testplatformengineering\.eason-bryce\.workers\.dev(?=$|[\s/<>)\]"?])/gi;

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
