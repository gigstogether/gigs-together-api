import {
  REGION_ALIAS_MAX_COUNT,
  REGION_NAME_MAX_LENGTH,
} from './region.constants';
import {
  isValidGeographicAliasList,
  isValidGeographicAliases,
  isValidGeographicName,
  normalizeGeographicAliases,
  normalizeGeographicName,
} from '../geographic-name.validators';

const REGION_NAME_CONSTRAINTS = {
  nameMaxLength: REGION_NAME_MAX_LENGTH,
  aliasMaxCount: REGION_ALIAS_MAX_COUNT,
};

export function normalizeRegionName(name: string): string {
  return normalizeGeographicName(name);
}

export function normalizeRegionAliases(aliases: string[]): string[] {
  return normalizeGeographicAliases(aliases);
}

export function isValidRegionName(name: string): boolean {
  return isValidGeographicName(name, REGION_NAME_MAX_LENGTH);
}

export function isValidRegionAliases(name: string, aliases: string[]): boolean {
  return isValidGeographicAliases(name, aliases, REGION_NAME_CONSTRAINTS);
}

export function isValidRegionAliasList(aliases: string[]): boolean {
  return isValidGeographicAliasList(aliases, REGION_NAME_CONSTRAINTS);
}
