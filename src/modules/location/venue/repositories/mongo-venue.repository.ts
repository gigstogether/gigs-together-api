import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { isRecord } from '@shared/utils/is-record';
import { VenueNameConflictError } from '../venue.errors';
import { Venue as VenueSchema } from '../venue.schema';
import type { VenueDocument } from '../venue.schema';
import type { Venue } from '../types/venue.types';
import { VenueRepositoryMapper } from './venue.repository.mapper';
import type { VenueLeanDocument } from './venue.repository.mapper';
import type {
  CreateVenueRecordParams,
  FindVenuesParams,
  VenueRepository,
  UpdateVenueRecordParams,
} from './venue.repository';

const VENUE_PROJECTION = {
  _id: 1,
  localityId: 1,
  name: 1,
  aliases: 1,
  isActive: 1,
} as const;

const VENUE_SORT = { localityId: 1, name: 1, _id: 1 } as const;

interface VenueMongoFilter {
  localityId?: Types.ObjectId;
  isActive?: boolean;
  $or?: Array<{ name: RegExp } | { aliases: RegExp }>;
}

@Injectable()
export class MongoVenueRepository implements VenueRepository {
  constructor(
    @InjectModel(VenueSchema.name)
    private readonly venueModel: Model<VenueDocument>,
  ) {}

  async create(params: CreateVenueRecordParams): Promise<Venue> {
    try {
      const doc = await this.venueModel.create({
        ...params,
        localityId: VenueRepositoryMapper.toStoredLocalityId(params.localityId),
      });

      return VenueRepositoryMapper.toVenue({
        _id: doc._id,
        localityId: doc.localityId,
        name: doc.name,
        aliases: doc.aliases,
        isActive: doc.isActive,
      });
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        throw new VenueNameConflictError(e);
      }
      throw e;
    }
  }

  async findById(id: string): Promise<Venue | null> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('Venue id must be a valid ObjectId');
    }

    const doc = await this.venueModel
      .findOne({ _id: new Types.ObjectId(id) }, VENUE_PROJECTION)
      .lean<VenueLeanDocument>()
      .exec();

    if (!doc) {
      return null;
    }

    return VenueRepositoryMapper.toVenue(doc);
  }

  async find(params: FindVenuesParams): Promise<readonly Venue[]> {
    const filter: VenueMongoFilter = {};

    if (params.localityId !== undefined) {
      filter.localityId = VenueRepositoryMapper.toStoredLocalityId(
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

    const docs = await this.venueModel
      .find(filter, VENUE_PROJECTION)
      .sort(VENUE_SORT)
      .lean<readonly VenueLeanDocument[]>()
      .exec();

    return VenueRepositoryMapper.toVenues(docs);
  }

  async existsByLocalityId(localityId: string): Promise<boolean> {
    const result = await this.venueModel.exists({
      localityId: VenueRepositoryMapper.toStoredLocalityId(localityId),
    });

    return result !== null;
  }

  async update(params: UpdateVenueRecordParams): Promise<Venue | null> {
    if (!Types.ObjectId.isValid(params.id)) {
      throw new Error('Venue id must be a valid ObjectId');
    }

    try {
      const doc = await this.venueModel
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
        .lean<VenueLeanDocument>()
        .exec();

      if (!doc) {
        return null;
      }

      return VenueRepositoryMapper.toVenue(doc);
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        throw new VenueNameConflictError(e);
      }
      throw e;
    }
  }

  async deleteById(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('Venue id must be a valid ObjectId');
    }

    const result = await this.venueModel
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
