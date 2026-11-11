import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CountryIsoConflictError } from './country.errors';
import { CountryReferenceService } from './country-reference.service';
import { COUNTRY_REPOSITORY } from './repositories/country.repository';
import type { CountryRepository } from './repositories/country.repository';
import type { Country } from './types/country.types';

interface CountryCache {
  countries: Country[];
  countryIsos: Set<string>;
}

export interface CreateCountryParams {
  iso: string;
}

@Injectable()
export class CountryService {
  private countryCache?: CountryCache;
  private countryCacheLoad?: Promise<CountryCache>;
  private countryCacheVersion = 0;

  constructor(
    @Inject(COUNTRY_REPOSITORY)
    private readonly countryRepository: CountryRepository,
    private readonly countryReferenceService: CountryReferenceService,
  ) {}

  async createCountry(params: CreateCountryParams): Promise<Country> {
    const hasReference = await this.countryReferenceService.hasCountry(
      params.iso,
    );

    if (!hasReference) {
      throw new BadRequestException(
        'Country ISO code "' + params.iso + '" is absent from the UNSD catalog',
      );
    }

    try {
      const country = await this.countryRepository.create({ iso: params.iso });

      this.invalidateCache();

      return country;
    } catch (e) {
      if (e instanceof CountryIsoConflictError) {
        throw new ConflictException(e.message, { cause: e });
      }
      throw e;
    }
  }

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

    if (this.countryCacheLoad === undefined) {
      const cacheVersion = this.countryCacheVersion;
      const cacheLoad = this.loadCountryCache(cacheVersion);

      this.countryCacheLoad = cacheLoad;
      cacheLoad.then(
        () => this.clearCompletedCacheLoad(cacheLoad),
        () => this.clearCompletedCacheLoad(cacheLoad),
      );
    }

    return this.countryCacheLoad;
  }

  private async loadCountryCache(cacheVersion: number): Promise<CountryCache> {
    const storedCountries = await this.countryRepository.findAllOrderedByIso();
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

    if (cacheVersion === this.countryCacheVersion) {
      this.countryCache = cache;
    }

    return cache;
  }

  private clearCompletedCacheLoad(cacheLoad: Promise<CountryCache>): void {
    if (this.countryCacheLoad === cacheLoad) {
      this.countryCacheLoad = undefined;
    }
  }

  private invalidateCache(): void {
    this.countryCacheVersion += 1;
    this.countryCache = undefined;
    this.countryCacheLoad = undefined;
  }
}
