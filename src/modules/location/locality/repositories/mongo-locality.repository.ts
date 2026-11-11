import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { isRecord } from '@shared/utils/is-record';
import { LocalityNameConflictError } from '../locality.errors';
import { Locality as LocalitySchema } from '../locality.schema';
import type { LocalityDocument } from '../locality.schema';
import type { Locality } from '../types/locality.types';
import { LocalityRepositoryMapper } from './locality.repository.mapper';
import type { LocalityLeanDocument } from './locality.repository.mapper';
import type {
  CreateLocalityRecordParams,
  FindLocalitiesParams,
  LocalityRepository,
  UpdateLocalityRecordParams,
} from './locality.repository';

const LOCALITY_PROJECTION = {
  _id: 1,
  regionId: 1,
  name: 1,
  aliases: 1,
  timeZone: 1,
} as const;

const LOCALITY_SORT = { regionId: 1, name: 1, _id: 1 } as const;

interface LocalityMongoFilter {
  regionId?: Types.ObjectId;
  $or?: Array<{ name: RegExp } | { aliases: RegExp }>;
}

@Injectable()
export class MongoLocalityRepository implements LocalityRepository {
  constructor(
    @InjectModel(LocalitySchema.name)
    private readonly localityModel: Model<LocalityDocument>,
  ) {}

  async create(params: CreateLocalityRecordParams): Promise<Locality> {
    try {
      const doc = await this.localityModel.create({
        ...params,
        regionId: LocalityRepositoryMapper.toStoredRegionId(params.regionId),
      });

      return LocalityRepositoryMapper.toLocality({
        _id: doc._id,
        regionId: doc.regionId,
        name: doc.name,
        aliases: doc.aliases,
        timeZone: doc.timeZone,
      });
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        throw new LocalityNameConflictError(e);
      }
      throw e;
    }
  }

  async findById(id: string): Promise<Locality | null> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('Locality id must be a valid ObjectId');
    }

    const doc = await this.localityModel
      .findOne({ _id: new Types.ObjectId(id) }, LOCALITY_PROJECTION)
      .lean<LocalityLeanDocument>()
      .exec();

    if (!doc) {
      return null;
    }

    return LocalityRepositoryMapper.toLocality(doc);
  }

  async find(params: FindLocalitiesParams): Promise<readonly Locality[]> {
    const filter: LocalityMongoFilter = {};

    if (params.regionId !== undefined) {
      filter.regionId = LocalityRepositoryMapper.toStoredRegionId(
        params.regionId,
      );
    }
    if (params.search !== undefined) {
      const pattern = new RegExp(escapeRegExp(params.search), 'iu');
      filter.$or = [{ name: pattern }, { aliases: pattern }];
    }

    const docs = await this.localityModel
      .find(filter, LOCALITY_PROJECTION)
      .sort(LOCALITY_SORT)
      .lean<readonly LocalityLeanDocument[]>()
      .exec();

    return LocalityRepositoryMapper.toLocalities(docs);
  }

  async existsByRegionId(regionId: string): Promise<boolean> {
    const result = await this.localityModel.exists({
      regionId: LocalityRepositoryMapper.toStoredRegionId(regionId),
    });

    return result !== null;
  }

  async update(params: UpdateLocalityRecordParams): Promise<Locality | null> {
    if (!Types.ObjectId.isValid(params.id)) {
      throw new Error('Locality id must be a valid ObjectId');
    }

    try {
      const doc = await this.localityModel
        .findOneAndUpdate(
          { _id: new Types.ObjectId(params.id) },
          {
            $set: {
              name: params.name,
              aliases: params.aliases,
              timeZone: params.timeZone,
            },
          },
          { returnDocument: 'after', runValidators: true },
        )
        .lean<LocalityLeanDocument>()
        .exec();

      if (!doc) {
        return null;
      }

      return LocalityRepositoryMapper.toLocality(doc);
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        throw new LocalityNameConflictError(e);
      }
      throw e;
    }
  }

  async deleteById(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('Locality id must be a valid ObjectId');
    }

    const result = await this.localityModel
      .deleteOne({ _id: new Types.ObjectId(id) })
      .exec();

    return result.deletedCount === 1;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&');
}

function isDuplicateKeyError(e: unknown): boolean {
  return isRecord(e) && e.code === 11000;
}
