import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, QueryFilter } from 'mongoose';
import type {
  TranslationEntry,
  TranslationRecord,
} from '../types/translation.types';
import { Translation, TranslationDocument } from '../translation.schema';
import { TranslationRepositoryMapper } from './translation.repository.mapper';
import type {
  TranslationEntryLeanDocument,
  TranslationRecordLeanDocument,
} from './translation.repository.mapper';
import type {
  FindActiveByNamespaceParams,
  FindActiveTranslationsParams,
  TranslationRepository,
} from './translation.repository';

@Injectable()
export class MongoTranslationRepository implements TranslationRepository {
  constructor(
    @InjectModel(Translation.name)
    private readonly translationModel: Model<TranslationDocument>,
  ) {}

  async findActiveTranslations(
    params: FindActiveTranslationsParams,
  ): Promise<readonly TranslationEntry[]> {
    const docs = await this.translationModel
      .find(MongoTranslationRepository.buildLocaleTranslationsFilter(params), {
        _id: 0,
        key: 1,
        value: 1,
        namespace: 1,
        format: 1,
        kind: 1,
      })
      .sort({ namespace: 1, key: 1 })
      .lean<readonly TranslationEntryLeanDocument[]>()
      .exec();

    return TranslationRepositoryMapper.toTranslationEntries(docs);
  }

  async findActiveByNamespace(
    params: FindActiveByNamespaceParams,
  ): Promise<readonly TranslationRecord[]> {
    const docs = await this.translationModel
      .find(
        { namespace: params.namespace, isActive: true },
        {
          _id: 0,
          locale: 1,
          namespace: 1,
          key: 1,
          value: 1,
          format: 1,
          kind: 1,
          isActive: 1,
        },
      )
      .sort({ locale: 1, key: 1 })
      .lean<readonly TranslationRecordLeanDocument[]>()
      .exec();

    return TranslationRepositoryMapper.toTranslationRecords(docs);
  }

  async findAllActiveRecords(): Promise<readonly TranslationRecord[]> {
    const docs = await this.translationModel
      .find(
        { isActive: true },
        {
          _id: 0,
          locale: 1,
          namespace: 1,
          key: 1,
          value: 1,
          format: 1,
          kind: 1,
          isActive: 1,
        },
      )
      .sort({ namespace: 1, locale: 1, key: 1 })
      .lean<readonly TranslationRecordLeanDocument[]>()
      .exec();

    return TranslationRepositoryMapper.toTranslationRecords(docs);
  }

  private static buildLocaleTranslationsFilter(
    params: FindActiveTranslationsParams,
  ): QueryFilter<Translation> {
    const filter: QueryFilter<Translation> = {
      locale: params.locale,
      isActive: true,
    };

    if (params.namespaces !== undefined) {
      filter.namespace = { $in: [...params.namespaces] };
    }

    return filter;
  }
}
