import { Inject, Injectable } from '@nestjs/common';
import { COUNTRY_REPOSITORY } from './repositories/country.repository';
import type { CountryRepository } from './repositories/country.repository';
import type { Country } from './types/country.types';

interface CountryCache {
  countries: Country[];
  countryIsos: Set<string>;
}

@Injectable()
export class CountryService {
  private countryCache?: CountryCache;
  private countryCacheLoad?: Promise<CountryCache>;

  constructor(
    @Inject(COUNTRY_REPOSITORY)
    private readonly countryRepository: CountryRepository,
  ) {}

  async getCountries(): Promise<readonly Country[]> {
    const cache = await this.getCountryCache();

    return cache.countries.map((country) => ({ iso: country.iso }));
  }

  async hasCountry(iso: string): Promise<boolean> {
    const cache = await this.getCountryCache();

    return cache.countryIsos.has(iso);
  }

  private getCountryCache(): Promise<CountryCache> {
    if (this.countryCache !== undefined) {
      return Promise.resolve(this.countryCache);
    }

    this.countryCacheLoad ??= this.loadCountryCache();

    return this.countryCacheLoad;
  }

  private async loadCountryCache(): Promise<CountryCache> {
    try {
      const storedCountries =
        await this.countryRepository.findAllOrderedByIso();
      const countries = storedCountries.map((country) => ({
        iso: country.iso,
      }));
      const cache: CountryCache = {
        countries,
        countryIsos: new Set(countries.map((country) => country.iso)),
      };

      if (cache.countryIsos.size !== countries.length) {
        throw new Error('Country catalog must contain unique ISO codes');
      }

      this.countryCache = cache;

      return cache;
    } catch (e) {
      this.countryCacheLoad = undefined;
      throw e;
    }
  }
}
