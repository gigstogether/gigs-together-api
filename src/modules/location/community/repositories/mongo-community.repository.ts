import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { Community as CommunitySchema } from '../community.schema';
import type { CommunityDocument } from '../community.schema';
import type { Community } from '../types/community.types';
import { CommunityRepositoryMapper } from './community.repository.mapper';
import type { CommunityLeanDocument } from './community.repository.mapper';
import type {
  CommunityRepository,
  FindCommunityByRouteParams,
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
