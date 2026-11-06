import {
  REGION_ALIAS_MAX_COUNT,
  REGION_NAME_MAX_LENGTH,
} from './region.constants';

export function normalizeRegionName(name: string): string {
  return name.trim();
}

export function normalizeRegionAliases(aliases: string[]): string[] {
  return aliases.map((alias) => alias.trim());
}

export function isValidRegionName(name: string): boolean {
  const normalizedName = normalizeRegionName(name);

  return (
    normalizedName.length > 0 && normalizedName.length <= REGION_NAME_MAX_LENGTH
  );
}

export function isValidRegionAliases(name: string, aliases: string[]): boolean {
  if (!isValidRegionAliasList(aliases)) {
    return false;
  }

  const normalizedNameKey = toComparisonKey(name);

  return aliases.every((alias) => toComparisonKey(alias) !== normalizedNameKey);
}

export function isValidRegionAliasList(aliases: string[]): boolean {
  if (aliases.length > REGION_ALIAS_MAX_COUNT) {
    return false;
  }

  const aliasKeys = new Set<string>();

  for (const alias of aliases) {
    if (!isValidRegionName(alias)) {
      return false;
    }

    const aliasKey = toComparisonKey(alias);
    if (aliasKeys.has(aliasKey)) {
      return false;
    }
    aliasKeys.add(aliasKey);
  }

  return true;
}

function toComparisonKey(value: string): string {
  // NFKC collapses compatibility variants such as full-width letters and
  // ligatures before comparison.
  return value.normalize('NFKC').toLowerCase();
}
