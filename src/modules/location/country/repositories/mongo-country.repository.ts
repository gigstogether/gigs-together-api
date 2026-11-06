import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Country as CountrySchema } from '../country.schema';
import type { CountryDocument } from '../country.schema';
import type { Country } from '../types/country.types';
import { CountryRepositoryMapper } from './country.repository.mapper';
import type { CountryLeanDocument } from './country.repository.mapper';
import type { CountryRepository } from './country.repository';

const COUNTRY_PROJECTION = {
  _id: 0,
  iso: 1,
} as const;

const COUNTRY_SORT = { iso: 1 } as const;

@Injectable()
export class MongoCountryRepository implements CountryRepository {
  constructor(
    @InjectModel(CountrySchema.name)
    private readonly countryModel: Model<CountryDocument>,
  ) {}

  async findAllOrderedByIso(): Promise<readonly Country[]> {
    const docs = await this.countryModel
      .find({}, COUNTRY_PROJECTION)
      .sort(COUNTRY_SORT)
      .lean<readonly CountryLeanDocument[]>()
      .exec();

    return CountryRepositoryMapper.toCountries(docs);
  }
}
