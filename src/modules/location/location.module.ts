import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { Country, CountrySchema } from './country/country.schema';
import { CountryService } from './country/country.service';
import { CountryReferenceService } from './country/country-reference.service';
import { CountriesController } from './country/countries.controller';
import { COUNTRY_REPOSITORY } from './country/repositories/country.repository';
import { MongoCountryRepository } from './country/repositories/mongo-country.repository';
import { Locality, LocalitySchema } from './locality/locality.schema';
import { LocalityService } from './locality/locality.service';
import { LOCALITY_REPOSITORY } from './locality/repositories/locality.repository';
import { MongoLocalityRepository } from './locality/repositories/mongo-locality.repository';
import { Place, PlaceSchema } from './place/place.schema';
import { PlaceService } from './place/place.service';
import { PLACE_REPOSITORY } from './place/repositories/place.repository';
import { MongoPlaceRepository } from './place/repositories/mongo-place.repository';
import { Region, RegionSchema } from './region/region.schema';
import { RegionService } from './region/region.service';
import { REGION_REPOSITORY } from './region/repositories/region.repository';
import { MongoRegionRepository } from './region/repositories/mongo-region.repository';

@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      { name: Country.name, schema: CountrySchema },
      { name: Locality.name, schema: LocalitySchema },
      { name: Place.name, schema: PlaceSchema },
      { name: Region.name, schema: RegionSchema },
    ]),
  ],
  controllers: [CountriesController],
  providers: [
    CountryService,
    CountryReferenceService,
    LocalityService,
    PlaceService,
    RegionService,
    {
      provide: COUNTRY_REPOSITORY,
      useClass: MongoCountryRepository,
    },
    {
      provide: LOCALITY_REPOSITORY,
      useClass: MongoLocalityRepository,
    },
    {
      provide: PLACE_REPOSITORY,
      useClass: MongoPlaceRepository,
    },
    {
      provide: REGION_REPOSITORY,
      useClass: MongoRegionRepository,
    },
  ],
  exports: [
    CountryReferenceService,
    CountryService,
    LocalityService,
    PlaceService,
    RegionService,
  ],
})
export class LocationModule {}
