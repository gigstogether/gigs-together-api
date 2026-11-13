import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CountryService } from './country/country.service';
import { CountriesController } from './country/countries.controller';
import { Locality, LocalitySchema } from './locality/locality.schema';
import { LocalityService } from './locality/locality.service';
import { LOCALITY_REPOSITORY } from './locality/repositories/locality.repository';
import { MongoLocalityRepository } from './locality/repositories/mongo-locality.repository';
import { Place, PlaceSchema } from './place/place.schema';
import { PlaceService } from './place/place.service';
import { PLACE_REPOSITORY } from './place/repositories/place.repository';
import { MongoPlaceRepository } from './place/repositories/mongo-place.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Locality.name, schema: LocalitySchema },
      { name: Place.name, schema: PlaceSchema },
    ]),
  ],
  controllers: [CountriesController],
  providers: [
    CountryService,
    LocalityService,
    PlaceService,
    {
      provide: LOCALITY_REPOSITORY,
      useClass: MongoLocalityRepository,
    },
    {
      provide: PLACE_REPOSITORY,
      useClass: MongoPlaceRepository,
    },
  ],
  exports: [CountryService, LocalityService, PlaceService],
})
export class LocationModule {}
