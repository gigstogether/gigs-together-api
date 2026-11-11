import {
  isValidGeographicAliasList,
  isValidGeographicAliases,
  isValidGeographicName,
  normalizeGeographicAliases,
  normalizeGeographicName,
} from '../geographic-name.validators';
import {
  PLACE_ALIAS_MAX_COUNT,
  PLACE_NAME_MAX_LENGTH,
} from './place.constants';

const PLACE_NAME_CONSTRAINTS = {
  nameMaxLength: PLACE_NAME_MAX_LENGTH,
  aliasMaxCount: PLACE_ALIAS_MAX_COUNT,
};

export function normalizePlaceName(name: string): string {
  return normalizeGeographicName(name);
}

export function normalizePlaceAliases(aliases: string[]): string[] {
  return normalizeGeographicAliases(aliases);
}

export function isValidPlaceName(name: string): boolean {
  return isValidGeographicName(name, PLACE_NAME_MAX_LENGTH);
}

export function isValidPlaceAliases(name: string, aliases: string[]): boolean {
  return isValidGeographicAliases(name, aliases, PLACE_NAME_CONSTRAINTS);
}

export function isValidPlaceAliasList(aliases: string[]): boolean {
  return isValidGeographicAliasList(aliases, PLACE_NAME_CONSTRAINTS);
}
