import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CountryService } from './country/country.service';
import { CountriesController } from './country/countries.controller';
import { Locality, LocalitySchema } from './locality/locality.schema';
import { LocalityService } from './locality/locality.service';
import { LOCALITY_REPOSITORY } from './locality/repositories/locality.repository';
import { MongoLocalityRepository } from './locality/repositories/mongo-locality.repository';
import { Venue, VenueSchema } from './venue/venue.schema';
import { VenueService } from './venue/venue.service';
import { VENUE_REPOSITORY } from './venue/repositories/venue.repository';
import { MongoVenueRepository } from './venue/repositories/mongo-venue.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Locality.name, schema: LocalitySchema },
      { name: Venue.name, schema: VenueSchema },
    ]),
  ],
  controllers: [CountriesController],
  providers: [
    CountryService,
    LocalityService,
    VenueService,
    {
      provide: LOCALITY_REPOSITORY,
      useClass: MongoLocalityRepository,
    },
    {
      provide: VENUE_REPOSITORY,
      useClass: MongoVenueRepository,
    },
  ],
  exports: [CountryService, LocalityService, VenueService],
})
export class LocationModule {}
