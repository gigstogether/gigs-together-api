import { Controller, Get, Version } from '@nestjs/common';
import { LocationService } from './location.service';
import type { Country } from './types/location.types';

@Controller('countries')
export class CountriesController {
  constructor(private readonly locationService: LocationService) {}

  @Version('1')
  @Get()
  getCountriesV1(): Promise<readonly Country[]> {
    return this.locationService.getCountriesV1();
  }
}
