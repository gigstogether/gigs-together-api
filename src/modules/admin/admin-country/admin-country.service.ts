import { Injectable } from '@nestjs/common';
import { CountryReferenceService } from '@modules/location/country/country-reference.service';
import { CountryService } from '@modules/location/country/country.service';
import type { CreateCountryParams } from '@modules/location/country/country.service';
import type { Country } from '@modules/location/country/types/country.types';

export interface AdminCountryOption {
  iso: string;
  isConfigured: boolean;
}

@Injectable()
export class AdminCountryService {
  constructor(
    private readonly countryService: CountryService,
    private readonly countryReferenceService: CountryReferenceService,
  ) {}

  getCountries(): Promise<readonly Country[]> {
    return this.countryService.getCountries();
  }

  async getCountryOptions(): Promise<AdminCountryOption[]> {
    const [configuredCountries, countryReferences] = await Promise.all([
      this.countryService.getCountries(),
      this.countryReferenceService.getCountries(),
    ]);
    const configuredIsos = new Set(
      configuredCountries.map((country) => country.iso),
    );

    return countryReferences.map((country) => ({
      iso: country.iso,
      isConfigured: configuredIsos.has(country.iso),
    }));
  }

  createCountry(params: CreateCountryParams): Promise<Country> {
    return this.countryService.createCountry(params);
  }
}
