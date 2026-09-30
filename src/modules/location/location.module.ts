import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CountriesController } from './countries.controller';
import { LocationService } from './location.service';
import { Country, CountrySchema } from './location.schema';
import { LOCATION_REPOSITORY } from './repositories/location.repository';
import { MongoLocationRepository } from './repositories/mongo-location.repository';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Country.name, schema: CountrySchema }]),
  ],
  controllers: [CountriesController],
  providers: [
    LocationService,
    {
      provide: LOCATION_REPOSITORY,
      useClass: MongoLocationRepository,
    },
  ],
})
export class LocationModule {}
