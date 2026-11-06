import { Controller, Get, Version } from '@nestjs/common';
import { CountryService } from './country.service';
import type { Country } from './types/country.types';

@Controller('countries')
export class CountriesController {
  constructor(private readonly countryService: CountryService) {}

  @Version('1')
  @Get()
  getCountriesV1(): Promise<readonly Country[]> {
    return this.countryService.getCountries();
  }
}
