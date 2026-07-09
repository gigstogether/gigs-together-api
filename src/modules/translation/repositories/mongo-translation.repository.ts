import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { TranslationRecord } from '../types/translation.types';
import type { StoredTranslationRecord } from '../types/translation-record.types';
import { Translation, TranslationDocument } from '../translation.schema';
import { TranslationRepositoryMapper } from './translation.repository.mapper';
import type {
  StoredTranslationRecordLeanDocument,
  TranslationRecordLeanDocument,
} from './translation.repository.mapper';
import type {
  FindActiveByNamespaceParams,
  FindAllTranslationsParams,
  FindByNamespaceParams,
  SetTranslationActiveByIdParams,
  TranslationRepository,
  UpsertTranslationRecordParams,
} from './translation.repository';

const TRANSLATION_RECORD_PROJECTION = {
  _id: 0,
  locale: 1,
  namespace: 1,
  key: 1,
  value: 1,
  format: 1,
  kind: 1,
  isActive: 1,
} as const;

const STORED_TRANSLATION_RECORD_PROJECTION = {
  _id: 1,
  locale: 1,
  namespace: 1,
  key: 1,
  value: 1,
  format: 1,
  kind: 1,
  isActive: 1,
} as const;

@Injectable()
export class MongoTranslationRepository implements TranslationRepository {
  constructor(
    @InjectModel(Translation.name)
    private readonly translationModel: Model<TranslationDocument>,
  ) {}

  async findActiveByNamespace(
    params: FindActiveByNamespaceParams,
  ): Promise<readonly TranslationRecord[]> {
    const docs = await this.translationModel
      .find(
        { namespace: params.namespace, isActive: true },
        TRANSLATION_RECORD_PROJECTION,
      )
      .sort({ locale: 1, key: 1 })
      .lean<readonly TranslationRecordLeanDocument[]>()
      .exec();

    return TranslationRepositoryMapper.toTranslationRecords(docs);
  }

  async findAllActiveRecords(): Promise<readonly TranslationRecord[]> {
    const docs = await this.translationModel
      .find({ isActive: true }, TRANSLATION_RECORD_PROJECTION)
      .sort({ namespace: 1, locale: 1, key: 1 })
      .lean<readonly TranslationRecordLeanDocument[]>()
      .exec();

    return TranslationRepositoryMapper.toTranslationRecords(docs);
  }

  async findByNamespace(
    params: FindByNamespaceParams,
  ): Promise<readonly StoredTranslationRecord[]> {
    const filter: { namespace: string; locale?: string } = {
      namespace: params.namespace,
    };

    if (params.locale !== undefined) {
      filter.locale = params.locale;
    }

    const docs = await this.translationModel
      .find(filter, STORED_TRANSLATION_RECORD_PROJECTION)
      .sort({ locale: 1, key: 1 })
      .lean<readonly StoredTranslationRecordLeanDocument[]>()
      .exec();

    return TranslationRepositoryMapper.toStoredTranslationRecords(docs);
  }

  async findAll(
    params: FindAllTranslationsParams,
  ): Promise<readonly StoredTranslationRecord[]> {
    const filter: { locale?: string } = {};

    if (params.locale !== undefined) {
      filter.locale = params.locale;
    }

    const docs = await this.translationModel
      .find(filter, STORED_TRANSLATION_RECORD_PROJECTION)
      .sort({ namespace: 1, locale: 1, key: 1 })
      .lean<readonly StoredTranslationRecordLeanDocument[]>()
      .exec();

    return TranslationRepositoryMapper.toStoredTranslationRecords(docs);
  }

  async listDistinctNamespaces(): Promise<readonly string[]> {
    const namespaces = await this.translationModel.distinct('namespace').exec();

    return namespaces
      .filter((namespace): namespace is string => typeof namespace === 'string')
      .map((namespace) => namespace.trim())
      .filter((namespace) => namespace.length > 0)
      .sort((left, right) => left.localeCompare(right));
  }

  async upsertRecord(
    params: UpsertTranslationRecordParams,
  ): Promise<StoredTranslationRecord> {
    const updated = await this.translationModel
      .findOneAndUpdate(
        {
          namespace: params.namespace,
          locale: params.locale,
          key: params.key,
        },
        {
          $set: {
            namespace: params.namespace,
            locale: params.locale,
            key: params.key,
            value: params.value,
            format: params.format,
            kind: params.kind,
            isActive: params.isActive,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .select(STORED_TRANSLATION_RECORD_PROJECTION)
      .lean<StoredTranslationRecordLeanDocument>()
      .exec();

    if (!updated) {
      throw new Error('Translation upsert did not return a document.');
    }

    return TranslationRepositoryMapper.toStoredTranslationRecord(updated);
  }

  async setActiveById(
    params: SetTranslationActiveByIdParams,
  ): Promise<StoredTranslationRecord | null> {
    const updated = await this.translationModel
      .findOneAndUpdate(
        { _id: params.id },
        { $set: { isActive: params.isActive } },
        { returnDocument: 'after' },
      )
      .select(STORED_TRANSLATION_RECORD_PROJECTION)
      .lean<StoredTranslationRecordLeanDocument>()
      .exec();

    if (!updated) {
      return null;
    }

    return TranslationRepositoryMapper.toStoredTranslationRecord(updated);
  }
}
