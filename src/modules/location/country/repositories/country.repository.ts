import type { Country } from '../types/country.types';

export const COUNTRY_REPOSITORY = Symbol('COUNTRY_REPOSITORY');

export interface CountryRepository {
  create(country: Country): Promise<Country>;
  findAllOrderedByIso(): Promise<readonly Country[]>;
}
