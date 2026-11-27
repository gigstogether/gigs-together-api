import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { isRecord } from '@shared/utils/is-record';
import { CommunityRouteConflictError } from '../community.errors';
import { Community as CommunitySchema } from '../community.schema';
import type { CommunityDocument } from '../community.schema';
import type { Community, CommunityData } from '../types/community.types';
import { CommunityRepositoryMapper } from './community.repository.mapper';
import type { CommunityLeanDocument } from './community.repository.mapper';
import type {
  CommunityRepository,
  FindCommunityByRouteParams,
  UpdateCommunityRecordParams,
} from './community.repository';

const COMMUNITY_PROJECTION = {
  _id: 1,
  countryIso: 1,
  slug: 1,
  nameTranslationKey: 1,
  timeZone: 1,
  isActive: 1,
} as const;

const COMMUNITY_SORT = { countryIso: 1, slug: 1 } as const;

@Injectable()
export class MongoCommunityRepository implements CommunityRepository {
  constructor(
    @InjectModel(CommunitySchema.name)
    private readonly communityModel: Model<CommunityDocument>,
  ) {}

  async create(data: CommunityData): Promise<Community> {
    try {
      const doc = await this.communityModel.create(data);
      return CommunityRepositoryMapper.toCommunity(
        doc.toObject<CommunityLeanDocument>(),
      );
    } catch (e) {
      this.throwWriteError(e);
    }
  }

  async findAll(): Promise<Community[]> {
    const docs = await this.communityModel
      .find({}, COMMUNITY_PROJECTION)
      .sort(COMMUNITY_SORT)
      .lean<CommunityLeanDocument[]>()
      .exec();
    return docs.map((doc) => CommunityRepositoryMapper.toCommunity(doc));
  }

  async update(params: UpdateCommunityRecordParams): Promise<Community | null> {
    try {
      const doc = await this.communityModel
        .findOneAndUpdate(
          {
            _id: this.toObjectId(params.id),
            countryIso: params.expected.countryIso,
            slug: params.expected.slug,
            nameTranslationKey: params.expected.nameTranslationKey,
            timeZone: params.expected.timeZone,
            isActive: params.expected.isActive,
          },
          { $set: params.data },
          {
            returnDocument: 'after',
            runValidators: true,
            projection: COMMUNITY_PROJECTION,
          },
        )
        .lean<CommunityLeanDocument>()
        .exec();
      return doc === null ? null : CommunityRepositoryMapper.toCommunity(doc);
    } catch (e) {
      this.throwWriteError(e);
    }
  }

  private toObjectId(id: string): Types.ObjectId {
    if (!/^[a-f\d]{24}$/i.test(id)) {
      throw new Error('Community id must be a valid ObjectId');
    }
    return new Types.ObjectId(id);
  }

  private throwWriteError(e: unknown): never {
    if (isRecord(e) && e.code === 11000) {
      throw new CommunityRouteConflictError(e);
    }
    throw e;
  }

  async findById(id: string): Promise<Community | null> {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('Community id must be a valid ObjectId');
    }

    const doc = await this.communityModel
      .findOne({ _id: new Types.ObjectId(id) }, COMMUNITY_PROJECTION)
      .lean<CommunityLeanDocument>()
      .exec();

    if (!doc) {
      return null;
    }

    return CommunityRepositoryMapper.toCommunity(doc);
  }

  async findByIds(ids: string[]): Promise<readonly Community[]> {
    const objectIds = ids.map((id) => {
      if (!Types.ObjectId.isValid(id)) {
        throw new Error('Community id must be a valid ObjectId');
      }

      return new Types.ObjectId(id);
    });
    const docs = await this.communityModel
      .find({ _id: { $in: objectIds } }, COMMUNITY_PROJECTION)
      .sort(COMMUNITY_SORT)
      .lean<readonly CommunityLeanDocument[]>()
      .exec();

    return CommunityRepositoryMapper.toCommunities(docs);
  }

  async findByRoute(
    params: FindCommunityByRouteParams,
  ): Promise<Community | null> {
    const doc = await this.communityModel
      .findOne(
        {
          countryIso: params.countryIso,
          slug: params.communitySlug,
        },
        COMMUNITY_PROJECTION,
      )
      .lean<CommunityLeanDocument>()
      .exec();

    if (!doc) {
      return null;
    }

    return CommunityRepositoryMapper.toCommunity(doc);
  }

  async findActive(): Promise<readonly Community[]> {
    const docs = await this.communityModel
      .find({ isActive: true }, COMMUNITY_PROJECTION)
      .sort(COMMUNITY_SORT)
      .lean<readonly CommunityLeanDocument[]>()
      .exec();

    return CommunityRepositoryMapper.toCommunities(docs);
  }
}
