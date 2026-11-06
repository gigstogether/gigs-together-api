import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommunityController } from './community/community.controller';
import { Community, CommunitySchema } from './community/community.schema';
import { CommunityService } from './community/community.service';
import { COMMUNITY_REPOSITORY } from './community/repositories/community.repository';
import { MongoCommunityRepository } from './community/repositories/mongo-community.repository';
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
      { name: Community.name, schema: CommunitySchema },
      { name: Country.name, schema: CountrySchema },
      { name: Region.name, schema: RegionSchema },
    ]),
  ],
  controllers: [CommunityController, CountriesController],
  providers: [
    CommunityService,
    CountryService,
    RegionService,
    {
      provide: COMMUNITY_REPOSITORY,
      useClass: MongoCommunityRepository,
    },
    {
      provide: COUNTRY_REPOSITORY,
      useClass: MongoCountryRepository,
    },
    {
      provide: REGION_REPOSITORY,
      useClass: MongoRegionRepository,
    },
  ],
  exports: [CommunityService, RegionService],
})
export class LocationModule {}
