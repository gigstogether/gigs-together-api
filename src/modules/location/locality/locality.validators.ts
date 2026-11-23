import { isValidIanaTimeZone } from '@shared/utils/is-valid-iana-time-zone';
import {
  isValidGeographicAliasList,
  isValidGeographicAliases,
  isValidGeographicName,
  normalizeGeographicAliases,
  normalizeGeographicName,
} from '../geographic-name.validators';
import {
  LOCALITY_ALIAS_MAX_COUNT,
  LOCALITY_NAME_MAX_LENGTH,
  LOCALITY_QUALIFIER_MAX_LENGTH,
} from './locality.constants';

const LOCALITY_NAME_CONSTRAINTS = {
  nameMaxLength: LOCALITY_NAME_MAX_LENGTH,
  aliasMaxCount: LOCALITY_ALIAS_MAX_COUNT,
};

export function normalizeLocalityName(name: string): string {
  return normalizeGeographicName(name);
}

export function normalizeLocalityAliases(aliases: string[]): string[] {
  return normalizeGeographicAliases(aliases);
}

export function normalizeLocalityQualifier(
  qualifier: string | undefined,
): string | undefined {
  if (qualifier === undefined) {
    return undefined;
  }

  return normalizeGeographicName(qualifier);
}

export function normalizeLocalityTimeZone(timeZone: string): string {
  return timeZone.trim();
}

export function isValidLocalityName(name: string): boolean {
  return isValidGeographicName(name, LOCALITY_NAME_MAX_LENGTH);
}

export function isValidLocalityQualifier(
  qualifier: string | undefined,
): boolean {
  return (
    qualifier === undefined ||
    isValidGeographicName(qualifier, LOCALITY_QUALIFIER_MAX_LENGTH)
  );
}

export function isValidLocalityAliases(
  name: string,
  aliases: string[],
): boolean {
  return isValidGeographicAliases(name, aliases, LOCALITY_NAME_CONSTRAINTS);
}

export function isValidLocalityAliasList(aliases: string[]): boolean {
  return isValidGeographicAliasList(aliases, LOCALITY_NAME_CONSTRAINTS);
}

export function isValidLocalityTimeZone(timeZone: string): boolean {
  return isValidIanaTimeZone(timeZone);
}
