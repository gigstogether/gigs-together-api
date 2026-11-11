const COMMUNITY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidCommunitySlug(slug: string): boolean {
  return COMMUNITY_SLUG_PATTERN.test(slug);
}
