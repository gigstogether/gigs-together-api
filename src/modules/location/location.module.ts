import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Community, CommunitySchema } from './community/community.schema';
import { CommunityService } from './community/community.service';
import { COMMUNITY_REPOSITORY } from './community/repositories/community.repository';
import { MongoCommunityRepository } from './community/repositories/mongo-community.repository';
import { Country, CountrySchema } from './country/country.schema';
import { CountryService } from './country/country.service';
import { CountriesController } from './country/countries.controller';
import { COUNTRY_REPOSITORY } from './country/repositories/country.repository';
import { MongoCountryRepository } from './country/repositories/mongo-country.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Community.name, schema: CommunitySchema },
      { name: Country.name, schema: CountrySchema },
    ]),
  ],
  controllers: [CountriesController],
  providers: [
    CommunityService,
    CountryService,
    {
      provide: COMMUNITY_REPOSITORY,
      useClass: MongoCommunityRepository,
    },
    {
      provide: COUNTRY_REPOSITORY,
      useClass: MongoCountryRepository,
    },
  ],
  exports: [CommunityService],
})
export class LocationModule {}
