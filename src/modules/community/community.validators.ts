const COMMUNITY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const COMMUNITY_SLUG_MAX_LENGTH = 120;
export const COMMUNITY_NAME_TRANSLATION_KEY_MAX_LENGTH = 200;

export function isValidCommunitySlug(slug: string): boolean {
  return (
    slug.length <= COMMUNITY_SLUG_MAX_LENGTH &&
    COMMUNITY_SLUG_PATTERN.test(slug)
  );
}
