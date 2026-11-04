import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Country, CountrySchema } from './country/country.schema';
import { CountryService } from './country/country.service';
import { CountriesController } from './country/countries.controller';
import { COUNTRY_REPOSITORY } from './country/repositories/country.repository';
import { MongoCountryRepository } from './country/repositories/mongo-country.repository';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Country.name, schema: CountrySchema }]),
  ],
  controllers: [CountriesController],
  providers: [
    CountryService,
    {
      provide: COUNTRY_REPOSITORY,
      useClass: MongoCountryRepository,
    },
  ],
})
export class LocationModule {}
