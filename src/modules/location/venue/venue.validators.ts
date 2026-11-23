import {
  isValidGeographicAliasList,
  isValidGeographicAliases,
  isValidGeographicName,
  normalizeGeographicAliases,
  normalizeGeographicName,
} from '../geographic-name.validators';
import {
  VENUE_ALIAS_MAX_COUNT,
  VENUE_NAME_MAX_LENGTH,
} from './venue.constants';

const VENUE_NAME_CONSTRAINTS = {
  nameMaxLength: VENUE_NAME_MAX_LENGTH,
  aliasMaxCount: VENUE_ALIAS_MAX_COUNT,
};

export function normalizeVenueName(name: string): string {
  return normalizeGeographicName(name);
}

export function normalizeVenueAliases(aliases: string[]): string[] {
  return normalizeGeographicAliases(aliases);
}

export function isValidVenueName(name: string): boolean {
  return isValidGeographicName(name, VENUE_NAME_MAX_LENGTH);
}

export function isValidVenueAliases(name: string, aliases: string[]): boolean {
  return isValidGeographicAliases(name, aliases, VENUE_NAME_CONSTRAINTS);
}

export function isValidVenueAliasList(aliases: string[]): boolean {
  return isValidGeographicAliasList(aliases, VENUE_NAME_CONSTRAINTS);
}
