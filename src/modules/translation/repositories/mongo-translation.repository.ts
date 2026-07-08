import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { TranslationRecord } from '../types/translation.types';
import { Translation, TranslationDocument } from '../translation.schema';
import { TranslationRepositoryMapper } from './translation.repository.mapper';
import type { TranslationRecordLeanDocument } from './translation.repository.mapper';
import type {
  FindActiveByNamespaceParams,
  TranslationRepository,
} from './translation.repository';

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
}
