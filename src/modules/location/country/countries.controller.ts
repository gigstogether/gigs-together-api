import { Controller, Get, Version } from '@nestjs/common';
import { CountryService } from './country.service';
import type { Country } from './country.service';

@Controller('countries')
export class CountriesController {
  constructor(private readonly countryService: CountryService) {}

  @Version('1')
  @Get()
  getCountriesV1(): Country[] {
    return this.countryService.getCountries();
  }
}
