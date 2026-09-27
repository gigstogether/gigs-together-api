import { Inject, Injectable } from '@nestjs/common';
import type { Country } from './types/location.types';
import { LOCATION_REPOSITORY } from './repositories/location.repository';
import type { LocationRepository } from './repositories/location.repository';

@Injectable()
export class LocationService {
  constructor(
    @Inject(LOCATION_REPOSITORY)
    private readonly locationRepository: LocationRepository,
  ) {}

  getCountriesV1(): Promise<readonly Country[]> {
    return this.locationRepository.findCountriesOrderedByIso();
  }
}
