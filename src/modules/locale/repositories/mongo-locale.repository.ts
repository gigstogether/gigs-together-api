import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { LocaleOrderUpdate, SupportedLocale } from '../types/locale.types';
import { Locale, LocaleDocument } from '../locale.schema';
import { LocaleRepositoryMapper } from './locale.repository.mapper';
import type { LocaleLeanDocument } from './locale.repository.mapper';
import type {
  LocaleRepository,
  UpdateLocaleRecordFields,
} from './locale.repository';

const LOCALE_PROJECTION = {
  _id: 0,
  iso: 1,
  nativeName: 1,
  isActive: 1,
  order: 1,
} as const;

const LOCALE_SORT = { order: 1, iso: 1 } as const;

@Injectable()
export class MongoLocaleRepository implements LocaleRepository {
  constructor(
    @InjectModel(Locale.name)
    private readonly localeModel: Model<LocaleDocument>,
  ) {}

  async findActiveLocalesOrdered(): Promise<readonly SupportedLocale[]> {
    const docs = await this.localeModel
      .find({ isActive: true }, LOCALE_PROJECTION)
      .sort(LOCALE_SORT)
      .lean<readonly LocaleLeanDocument[]>()
      .exec();

    return LocaleRepositoryMapper.toActiveSupportedLocales(docs);
  }

  async findAllLocalesOrdered(): Promise<readonly SupportedLocale[]> {
    const docs = await this.localeModel
      .find({}, LOCALE_PROJECTION)
      .sort(LOCALE_SORT)
      .lean<readonly LocaleLeanDocument[]>()
      .exec();

    return LocaleRepositoryMapper.toSupportedLocales(docs);
  }

  async countOtherActiveLocales(iso: string): Promise<number> {
    return this.localeModel
      .countDocuments({ isActive: true, iso: { $ne: iso } })
      .exec();
  }

  async updateLocaleByIso(
    iso: string,
    update: UpdateLocaleRecordFields,
  ): Promise<SupportedLocale | null> {
    const updated = await this.localeModel
      .findOneAndUpdate({ iso }, update, { returnDocument: 'after' })
      .select(LOCALE_PROJECTION)
      .lean<LocaleLeanDocument>()
      .exec();

    if (!updated) {
      return null;
    }

    return LocaleRepositoryMapper.toSupportedLocale(updated);
  }

  async findIsosByIsoList(isos: readonly string[]): Promise<readonly string[]> {
    const docs = await this.localeModel
      .find({ iso: { $in: isos } }, { iso: 1 })
      .lean<Array<{ readonly iso: string }>>()
      .exec();

    return docs.map((locale) => locale.iso);
  }

  async bulkOrderUpdate(updates: readonly LocaleOrderUpdate[]): Promise<void> {
    await this.localeModel.bulkWrite(
      updates.map((update) => ({
        updateOne: {
          filter: { iso: update.iso },
          update: { $set: { order: update.order } },
        },
      })),
    );
  }
}
