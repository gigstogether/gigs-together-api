import type { Country } from '../types/location.types';

export const LOCATION_REPOSITORY = Symbol('LOCATION_REPOSITORY');

export interface LocationRepository {
  findCountriesOrderedByIso(): Promise<readonly Country[]>;
}
