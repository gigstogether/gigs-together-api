import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Country as CountrySchema } from '../location.schema';
import type { CountryDocument } from '../location.schema';
import type { Country } from '../types/location.types';
import { LocationRepositoryMapper } from './location.repository.mapper';
import type { CountryLeanDocument } from './location.repository.mapper';
import type { LocationRepository } from './location.repository';

const COUNTRY_PROJECTION = {
  _id: 0,
  iso: 1,
} as const;

const COUNTRY_SORT = { iso: 1 } as const;

@Injectable()
export class MongoLocationRepository implements LocationRepository {
  constructor(
    @InjectModel(CountrySchema.name)
    private readonly countryModel: Model<CountryDocument>,
  ) {}

  async findCountriesOrderedByIso(): Promise<readonly Country[]> {
    const docs = await this.countryModel
      .find({}, COUNTRY_PROJECTION)
      .sort(COUNTRY_SORT)
      .lean<readonly CountryLeanDocument[]>()
      .exec();

    return LocationRepositoryMapper.toCountries(docs);
  }
}
