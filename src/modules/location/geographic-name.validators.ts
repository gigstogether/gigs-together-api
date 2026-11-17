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

  const normalizedNameKey = toGeographicSearchKey(name);

  return aliases.every(
    (alias) => toGeographicSearchKey(alias) !== normalizedNameKey,
  );
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

    const aliasKey = toGeographicSearchKey(alias);
    if (aliasKeys.has(aliasKey)) {
      return false;
    }
    aliasKeys.add(aliasKey);
  }

  return true;
}

export function toGeographicSearchKey(value: string): string {
  // NFKD expands compatibility variants and separates diacritics. Removing
  // marks and separators makes searches treat forms such as "L’Hospitalet",
  // "L Hospitalet", and "LHospitalet" as equivalent.
  return normalizeGeographicName(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[\p{P}\s]+/gu, '')
    .toLowerCase();
}
