import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { isRecord } from '@shared/utils/is-record';
import { PlaceNameConflictError } from '../place.errors';
import { Place as PlaceSchema } from '../place.schema';
import type { PlaceDocument } from '../place.schema';
import type { Place } from '../types/place.types';
import { PlaceRepositoryMapper } from './place.repository.mapper';
import type { PlaceLeanDocument } from './place.repository.mapper';
import type {
  CreatePlaceRecordParams,
  FindPlacesParams,
  PlaceRepository,
  UpdatePlaceRecordParams,
} from './place.repository';

const PLACE_PROJECTION = {
  _id: 1,
  localityId: 1,
  name: 1,
  aliases: 1,
  isActive: 1,
} as const;

const PLACE_SORT = { localityId: 1, name: 1, _id: 1 } as const;

interface PlaceMongoFilter {
  localityId?: Types.ObjectId;
  isActive?: boolean;
  $or?: Array<{ name: RegExp } | { aliases: RegExp }>;
}

@Injectable()
export class MongoPlaceRepository implements PlaceRepository {
  constructor(
    @InjectModel(PlaceSchema.name)
    private readonly placeModel: Model<PlaceDocument>,
  ) {}

  async create(params: CreatePlaceRecordParams): Promise<Place> {
    try {
      const doc = await this.placeModel.create({
        ...params,
        localityId: PlaceRepositoryMapper.toStoredLocalityId(params.localityId),
      });

      return PlaceRepositoryMapper.toPlace({
        _id: doc._id,
        localityId: doc.localityId,
        name: doc.name,
        aliases: doc.aliases,
        isActive: doc.isActive,
      });
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        throw new PlaceNameConflictError(e);
      }
      throw e;
    }
  }

  async findById(id: string): Promise<Place | null> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('Place id must be a valid ObjectId');
    }

    const doc = await this.placeModel
      .findOne({ _id: new Types.ObjectId(id) }, PLACE_PROJECTION)
      .lean<PlaceLeanDocument>()
      .exec();

    if (!doc) {
      return null;
    }

    return PlaceRepositoryMapper.toPlace(doc);
  }

  async find(params: FindPlacesParams): Promise<readonly Place[]> {
    const filter: PlaceMongoFilter = {};

    if (params.localityId !== undefined) {
      filter.localityId = PlaceRepositoryMapper.toStoredLocalityId(
        params.localityId,
      );
    }
    if (params.isActive !== undefined) {
      filter.isActive = params.isActive;
    }
    if (params.search !== undefined) {
      const pattern = new RegExp(escapeRegExp(params.search), 'iu');
      filter.$or = [{ name: pattern }, { aliases: pattern }];
    }

    const docs = await this.placeModel
      .find(filter, PLACE_PROJECTION)
      .sort(PLACE_SORT)
      .lean<readonly PlaceLeanDocument[]>()
      .exec();

    return PlaceRepositoryMapper.toPlaces(docs);
  }

  async existsByLocalityId(localityId: string): Promise<boolean> {
    const result = await this.placeModel.exists({
      localityId: PlaceRepositoryMapper.toStoredLocalityId(localityId),
    });

    return result !== null;
  }

  async update(params: UpdatePlaceRecordParams): Promise<Place | null> {
    if (!Types.ObjectId.isValid(params.id)) {
      throw new Error('Place id must be a valid ObjectId');
    }

    try {
      const doc = await this.placeModel
        .findOneAndUpdate(
          { _id: new Types.ObjectId(params.id) },
          {
            $set: {
              name: params.name,
              aliases: params.aliases,
              isActive: params.isActive,
            },
          },
          { returnDocument: 'after', runValidators: true },
        )
        .lean<PlaceLeanDocument>()
        .exec();

      if (!doc) {
        return null;
      }

      return PlaceRepositoryMapper.toPlace(doc);
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        throw new PlaceNameConflictError(e);
      }
      throw e;
    }
  }

  async deleteById(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('Place id must be a valid ObjectId');
    }

    const result = await this.placeModel
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
