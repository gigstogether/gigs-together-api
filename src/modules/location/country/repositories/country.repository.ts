import type { Country } from '../types/country.types';

export const COUNTRY_REPOSITORY = Symbol('COUNTRY_REPOSITORY');

export interface CountryRepository {
  findAllOrderedByIso(): Promise<readonly Country[]>;
}
