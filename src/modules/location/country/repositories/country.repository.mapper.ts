import type { Country } from '../types/country.types';

export interface CountryLeanDocument {
  iso: unknown;
}

export class CountryRepositoryMapper {
  static toCountry(doc: CountryLeanDocument): Country {
    if (typeof doc.iso !== 'string' || !/^[A-Z]{2}$/.test(doc.iso)) {
      throw new Error(
        'Country iso must be an uppercase ISO 3166-1 alpha-2 code',
      );
    }

    return { iso: doc.iso };
  }

  static toCountries(docs: readonly CountryLeanDocument[]): readonly Country[] {
    return docs.map((doc) => CountryRepositoryMapper.toCountry(doc));
  }
}
