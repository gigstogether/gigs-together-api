const COUNTRY_ISO_PATTERN = /^[A-Z]{2}$/;
const COMMUNITY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidCommunityCountryIso(countryIso: string): boolean {
  return COUNTRY_ISO_PATTERN.test(countryIso);
}

export function isValidCommunitySlug(slug: string): boolean {
  return COMMUNITY_SLUG_PATTERN.test(slug);
}

export function isValidCommunityTimeZone(timeZone: string): boolean {
  if (timeZone.length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}
