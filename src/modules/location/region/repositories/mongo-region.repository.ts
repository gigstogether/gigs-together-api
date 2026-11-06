import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { isRecord } from '@shared/utils/is-record';
import { RegionNameConflictError } from '../region.errors';
import { Region as RegionSchema } from '../region.schema';
import type { RegionDocument } from '../region.schema';
import type { Region } from '../types/region.types';
import { RegionRepositoryMapper } from './region.repository.mapper';
import type { RegionLeanDocument } from './region.repository.mapper';
import type {
  CreateRegionRecordParams,
  FindRegionsParams,
  RegionRepository,
  UpdateRegionRecordParams,
} from './region.repository';

const REGION_PROJECTION = {
  _id: 1,
  countryIso: 1,
  name: 1,
  aliases: 1,
} as const;

const REGION_SORT = { countryIso: 1, name: 1, _id: 1 } as const;

interface RegionMongoFilter {
  countryIso?: string;
  $or?: Array<{ name: RegExp } | { aliases: RegExp }>;
}

@Injectable()
export class MongoRegionRepository implements RegionRepository {
  constructor(
    @InjectModel(RegionSchema.name)
    private readonly regionModel: Model<RegionDocument>,
  ) {}

  async create(params: CreateRegionRecordParams): Promise<Region> {
    try {
      const doc = await this.regionModel.create(params);

      return RegionRepositoryMapper.toRegion({
        _id: doc._id,
        countryIso: doc.countryIso,
        name: doc.name,
        aliases: doc.aliases,
      });
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        throw new RegionNameConflictError(e);
      }
      throw e;
    }
  }

  async findById(id: string): Promise<Region | null> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('Region id must be a valid ObjectId');
    }

    const doc = await this.regionModel
      .findOne({ _id: new Types.ObjectId(id) }, REGION_PROJECTION)
      .lean<RegionLeanDocument>()
      .exec();

    if (!doc) {
      return null;
    }

    return RegionRepositoryMapper.toRegion(doc);
  }

  async find(params: FindRegionsParams): Promise<readonly Region[]> {
    const filter: RegionMongoFilter = {};

    if (params.countryIso !== undefined) {
      filter.countryIso = params.countryIso;
    }
    if (params.search !== undefined) {
      const pattern = new RegExp(escapeRegExp(params.search), 'iu');
      filter.$or = [{ name: pattern }, { aliases: pattern }];
    }

    const docs = await this.regionModel
      .find(filter, REGION_PROJECTION)
      .sort(REGION_SORT)
      .lean<readonly RegionLeanDocument[]>()
      .exec();

    return RegionRepositoryMapper.toRegions(docs);
  }

  async update(params: UpdateRegionRecordParams): Promise<Region | null> {
    if (!Types.ObjectId.isValid(params.id)) {
      throw new Error('Region id must be a valid ObjectId');
    }

    try {
      const doc = await this.regionModel
        .findOneAndUpdate(
          { _id: new Types.ObjectId(params.id) },
          {
            $set: {
              name: params.name,
              aliases: params.aliases,
            },
          },
          { returnDocument: 'after', runValidators: true },
        )
        .lean<RegionLeanDocument>()
        .exec();

      if (!doc) {
        return null;
      }

      return RegionRepositoryMapper.toRegion(doc);
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        throw new RegionNameConflictError(e);
      }
      throw e;
    }
  }

  async deleteById(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('Region id must be a valid ObjectId');
    }

    const result = await this.regionModel
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
