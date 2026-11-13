export interface GeographicNameConstraints {
  nameMaxLength: number;
  aliasMaxCount: number;
}

export function normalizeGeographicName(name: string): string {
  return name.trim();
}

export function normalizeGeographicAliases(aliases: string[]): string[] {
  return aliases.map((alias) => alias.trim());
}

export function isValidGeographicName(
  name: string,
  maxLength: number,
): boolean {
  const normalizedName = normalizeGeographicName(name);

  return normalizedName.length > 0 && normalizedName.length <= maxLength;
}

export function isValidGeographicAliases(
  name: string,
  aliases: string[],
  constraints: GeographicNameConstraints,
): boolean {
  if (!isValidGeographicAliasList(aliases, constraints)) {
    return false;
  }

  const normalizedNameKey = toComparisonKey(name);

  return aliases.every((alias) => toComparisonKey(alias) !== normalizedNameKey);
}

export function isValidGeographicAliasList(
  aliases: string[],
  constraints: GeographicNameConstraints,
): boolean {
  if (aliases.length > constraints.aliasMaxCount) {
    return false;
  }

  const aliasKeys = new Set<string>();

  for (const alias of aliases) {
    if (!isValidGeographicName(alias, constraints.nameMaxLength)) {
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
