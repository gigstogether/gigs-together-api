/**
 * camelCase namespace identifier for translation records.
 *
 * Keep validation rules in sync with
 * `gigs-together-front/src/lib/translation-identifiers.ts`.
 *
 * Rules:
 * - starts with a lowercase letter
 * - followed by up to 63 alphanumeric characters
 * - no dots, underscores, or hyphens
 *
 * Valid: `common`, `telegram`, `feedFilters`
 * Invalid: `Common`, `telegram_post`, `feed-filters`, `common.ui`
 */
const TRANSLATION_NAMESPACE_PATTERN = /^[a-z][a-zA-Z0-9]{0,63}$/;

/**
 * camelCase translation key, optionally grouped with dot-separated segments.
 *
 * Rules:
 * - each segment starts with a lowercase letter
 * - each segment may contain alphanumeric characters after the first letter
 * - segments are separated by `.`
 *
 * Valid: `title`, `mainGig.withLink`, `weeklyDigest.gigLine.html`, `button.approve`
 * Invalid: `MainGig.withLink`, `main_gig.withLink`, `weeklyDigest.gig-line`
 */
const TRANSLATION_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*$/;

export function isValidTranslationNamespace(namespace: string): boolean {
  return TRANSLATION_NAMESPACE_PATTERN.test(namespace);
}

export function isValidTranslationKey(key: string): boolean {
  return TRANSLATION_KEY_PATTERN.test(key);
}
