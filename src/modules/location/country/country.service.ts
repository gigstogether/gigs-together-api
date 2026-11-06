import { Inject, Injectable } from '@nestjs/common';
import { COUNTRY_REPOSITORY } from './repositories/country.repository';
import type { CountryRepository } from './repositories/country.repository';
import type { Country } from './types/country.types';

@Injectable()
export class CountryService {
  constructor(
    @Inject(COUNTRY_REPOSITORY)
    private readonly countryRepository: CountryRepository,
  ) {}

  getCountries(): Promise<readonly Country[]> {
    return this.countryRepository.findAllOrderedByIso();
  }
}
