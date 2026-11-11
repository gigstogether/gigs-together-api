import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { isRecord } from '@shared/utils/is-record';
import { CountryIsoConflictError } from '../country.errors';
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

  async create(country: Country): Promise<Country> {
    try {
      const doc = await this.countryModel.create(country);

      return CountryRepositoryMapper.toCountry({ iso: doc.iso });
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        throw new CountryIsoConflictError(e);
      }
      throw e;
    }
  }

  async findAllOrderedByIso(): Promise<readonly Country[]> {
    const docs = await this.countryModel
      .find({}, COUNTRY_PROJECTION)
      .sort(COUNTRY_SORT)
      .lean<readonly CountryLeanDocument[]>()
      .exec();

    return CountryRepositoryMapper.toCountries(docs);
  }
}

function isDuplicateKeyError(e: unknown): boolean {
  return isRecord(e) && e.code === 11000;
}
