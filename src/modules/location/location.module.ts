import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Country, CountrySchema } from './country/country.schema';
import { CountryService } from './country/country.service';
import { CountriesController } from './country/countries.controller';
import { COUNTRY_REPOSITORY } from './country/repositories/country.repository';
import { MongoCountryRepository } from './country/repositories/mongo-country.repository';
import { Region, RegionSchema } from './region/region.schema';
import { RegionService } from './region/region.service';
import { REGION_REPOSITORY } from './region/repositories/region.repository';
import { MongoRegionRepository } from './region/repositories/mongo-region.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Country.name, schema: CountrySchema },
      { name: Region.name, schema: RegionSchema },
    ]),
  ],
  controllers: [CountriesController],
  providers: [
    CountryService,
    RegionService,
    {
      provide: COUNTRY_REPOSITORY,
      useClass: MongoCountryRepository,
    },
    {
      provide: REGION_REPOSITORY,
      useClass: MongoRegionRepository,
    },
  ],
  exports: [CountryService, RegionService],
})
export class LocationModule {}
