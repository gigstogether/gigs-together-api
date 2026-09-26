import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model, QueryFilter, UpdateQuery } from 'mongoose';
import { Messenger } from '../../../shared/types/messenger.enum';
import { PostType } from '../../../shared/types/post-type.enum';
import { Gig } from '../gig.schema';
import type { GigDocument } from '../gig.schema';
import {
  ADMIN_GIG_LIST_DEFAULT_SORT_ORDER,
  AdminGigListSortBy,
  AdminGigListSortOrder,
} from '../types/admin-gig-list-sort.types';
import type { PlainGig } from '../types/gig.types';
import type {
  AppendGigMainPostRecordParams,
  FindGigsParams,
  FindVisibleGigsAroundParams,
  FindVisibleGigsAroundResult,
  FindVisibleGigsInRangeParams,
  FindVisibleGigsPageParams,
  FindVisibleGigsPageResult,
  GigRepository,
  IsGigPublicIdTakenParams,
  UpdateGigByPublicIdRecordParams,
  UpdateGigTelegramPostFileIdRecordParams,
  UpdateGigVisibilityRecordParams,
} from './gig.repository';
import { GigRepositoryMapper } from './gig.repository.mapper';
import type { GigLeanDocument } from './gig.repository.mapper';

const GIG_COLLATION = { locale: 'en', strength: 2 } as const;

@Injectable()
export class MongoGigRepository implements GigRepository {
  constructor(
    @InjectModel(Gig.name)
    private readonly gigModel: Model<GigDocument>,
  ) {}

  async existsByPublicId(publicId: string): Promise<boolean> {
    const existing = await this.gigModel.exists({ publicId }).exec();
    return existing !== null;
  }

  async isPublicIdTaken(params: IsGigPublicIdTakenParams): Promise<boolean> {
    const filter: QueryFilter<GigDocument> = { publicId: params.publicId };
    if (params.excludeGigId !== undefined) {
      filter._id = { $ne: this.toObjectId(params.excludeGigId) };
    }
    const existing = await this.gigModel.exists(filter).exec();
    return existing !== null;
  }

  countAll(): Promise<number> {
    return this.gigModel.countDocuments({}).exec();
  }

  countVisible(): Promise<number> {
    return this.gigModel.countDocuments({ isVisible: true }).exec();
  }

  async findMany(params: FindGigsParams): Promise<PlainGig[]> {
    let query = this.gigModel.find({});
    if (params.sortBy !== undefined) {
      const sortOrder = params.sortOrder ?? ADMIN_GIG_LIST_DEFAULT_SORT_ORDER;
      const direction: 1 | -1 =
        sortOrder === AdminGigListSortOrder.Asc ? 1 : -1;
      switch (params.sortBy) {
        case AdminGigListSortBy.CreatedAt:
          query = query.sort({ createdAt: direction, _id: direction });
          break;
        case AdminGigListSortBy.EventDate:
          query = query.sort({ date: direction, _id: direction });
          break;
      }
    }
    const gigs = await query
      .limit(params.limit)
      .lean<GigLeanDocument[]>()
      .exec();
    return GigRepositoryMapper.toGigs(gigs);
  }

  async findByPublicId(publicId: string): Promise<PlainGig | null> {
    const gig = await this.gigModel
      .findOne({ publicId })
      .lean<GigLeanDocument>()
      .exec();
    return gig ? GigRepositoryMapper.toGig(gig) : null;
  }

  async findById(gigId: string): Promise<PlainGig | null> {
    const gig = await this.gigModel
      .findById(this.toObjectId(gigId))
      .lean<GigLeanDocument>()
      .exec();
    return gig ? GigRepositoryMapper.toGig(gig) : null;
  }

  async findByIds(gigIds: string[]): Promise<PlainGig[]> {
    if (gigIds.length === 0) {
      return [];
    }
    const gigs = await this.gigModel
      .find({ _id: { $in: gigIds.map((gigId) => this.toObjectId(gigId)) } })
      .lean<GigLeanDocument[]>()
      .exec();
    return GigRepositoryMapper.toGigs(gigs);
  }

  async updateByPublicId(
    params: UpdateGigByPublicIdRecordParams,
  ): Promise<PlainGig | null> {
    const update: UpdateQuery<GigDocument> = {
      $set: {
        title: params.title,
        date: params.date,
        city: params.city,
        country: params.country,
        venue: params.venue,
        ticketsUrl: params.ticketsUrl,
      },
      $inc: { version: 1 },
    };
    if (params.endDate !== undefined) {
      update.$set = { ...update.$set, endDate: params.endDate };
    } else {
      update.$unset = { endDate: 1 };
    }
    if (params.poster !== undefined) {
      update.$set = { ...update.$set, poster: params.poster };
    }
    const gig = await this.gigModel
      .findOneAndUpdate(
        { publicId: params.publicId, version: params.expectedVersion },
        update,
        { returnDocument: 'after' },
      )
      .lean<GigLeanDocument>()
      .exec();
    return gig ? GigRepositoryMapper.toGig(gig) : null;
  }

  async updateVisibility(
    params: UpdateGigVisibilityRecordParams,
  ): Promise<PlainGig | null> {
    const gig = await this.gigModel
      .findOneAndUpdate(
        { publicId: params.publicId, version: params.expectedVersion },
        {
          $set: { isVisible: params.isVisible },
          $inc: { version: 1 },
        },
        { returnDocument: 'after' },
      )
      .lean<GigLeanDocument>()
      .exec();
    return gig ? GigRepositoryMapper.toGig(gig) : null;
  }

  async appendMainPost(
    params: AppendGigMainPostRecordParams,
  ): Promise<PlainGig | null> {
    const gig = await this.gigModel
      .findOneAndUpdate(
        {
          _id: this.toObjectId(params.gigId),
          version: params.expectedVersion,
          posts: {
            $not: {
              $elemMatch: { to: Messenger.Telegram, type: PostType.Main },
            },
          },
        },
        {
          $push: { posts: params.post },
          $inc: { version: 1 },
        },
        { returnDocument: 'after' },
      )
      .lean<GigLeanDocument>()
      .exec();
    return gig ? GigRepositoryMapper.toGig(gig) : null;
  }

  async updateTelegramPostFileId(
    params: UpdateGigTelegramPostFileIdRecordParams,
  ): Promise<PlainGig | null> {
    const gig = await this.gigModel
      .findOneAndUpdate(
        {
          _id: this.toObjectId(params.gigId),
          version: params.expectedVersion,
          posts: {
            $elemMatch: {
              to: Messenger.Telegram,
              type: params.type,
              id: params.messageId,
              chatId: params.chatId,
            },
          },
        },
        {
          // fileId is Telegram transport metadata. Keeping the version stable preserves the
          // expectedVersion already embedded in the current moderation post controls.
          $set: { 'posts.$.fileId': params.fileId },
        },
        { returnDocument: 'after' },
      )
      .lean<GigLeanDocument>()
      .exec();
    return gig ? GigRepositoryMapper.toGig(gig) : null;
  }

  async findVisibleInRange(
    params: FindVisibleGigsInRangeParams,
  ): Promise<PlainGig[]> {
    const gigs = await this.gigModel
      .find(this.buildVisibleRangeFilter(params))
      .collation(GIG_COLLATION)
      .sort({ date: 1, _id: 1 })
      .lean<GigLeanDocument[]>()
      .exec();
    return GigRepositoryMapper.toGigs(gigs);
  }

  async findVisiblePage(
    params: FindVisibleGigsPageParams,
  ): Promise<FindVisibleGigsPageResult> {
    const filters: QueryFilter<GigDocument>[] = [
      this.buildFeedVisibleFilter(params),
    ];
    if (params.cursor !== undefined) {
      const cursorId = this.toObjectId(params.cursor.gigId);
      filters.push(
        params.direction === 'prev'
          ? {
              $or: [
                { date: { $lt: params.cursor.date } },
                { date: params.cursor.date, _id: { $lt: cursorId } },
              ],
            }
          : {
              $or: [
                { date: { $gt: params.cursor.date } },
                { date: params.cursor.date, _id: { $gt: cursorId } },
              ],
            },
      );
    }
    const filter = filters.length === 1 ? filters[0] : { $and: filters };
    const sort =
      params.direction === 'prev'
        ? ({ date: -1, _id: -1 } as const)
        : ({ date: 1, _id: 1 } as const);
    const docs = await this.gigModel
      .find(filter)
      .collation(GIG_COLLATION)
      .sort(sort)
      .limit(params.limit + 1)
      .lean<GigLeanDocument[]>()
      .exec();
    const hasMore = docs.length > params.limit;
    const page = hasMore ? docs.slice(0, params.limit) : docs;
    // Keep the public API consistent: always return gigs ordered ascending.
    const ascendingPage =
      params.direction === 'prev' ? page.slice().reverse() : page;
    return {
      gigs: GigRepositoryMapper.toGigs(ascendingPage),
      hasMore,
    };
  }

  async findVisibleDateByPublicId(publicId: string): Promise<number | null> {
    const gig = await this.gigModel
      .findOne({ publicId, isVisible: true }, { date: 1 })
      .collation(GIG_COLLATION)
      .lean<{ date: number }>()
      .exec();
    return gig?.date ?? null;
  }

  async findVisibleAround(
    params: FindVisibleGigsAroundParams,
  ): Promise<FindVisibleGigsAroundResult> {
    const baseFilter = this.buildVisibleLocationFilter(params);
    const beforeDocs =
      params.beforeLimit === 0
        ? []
        : await this.gigModel
            .find({
              ...baseFilter,
              date: { $gte: params.todayStart, $lt: params.anchor },
            })
            .collation(GIG_COLLATION)
            .sort({ date: -1, _id: -1 })
            .limit(params.beforeLimit + 1)
            .lean<GigLeanDocument[]>()
            .exec();
    const hasPrevious = beforeDocs.length > params.beforeLimit;
    const beforePage = hasPrevious
      ? beforeDocs.slice(0, params.beforeLimit)
      : beforeDocs;
    const afterDocs = await this.gigModel
      .find({ ...baseFilter, date: { $gte: params.anchor } })
      .collation(GIG_COLLATION)
      .sort({ date: 1, _id: 1 })
      .limit(params.afterLimit + 1)
      .lean<GigLeanDocument[]>()
      .exec();
    const hasNext = afterDocs.length > params.afterLimit;
    const afterPage = hasNext
      ? afterDocs.slice(0, params.afterLimit)
      : afterDocs;
    return {
      before: GigRepositoryMapper.toGigs(beforePage.slice().reverse()),
      after: GigRepositoryMapper.toGigs(afterPage),
      hasPrevious,
      hasNext,
    };
  }

  async findVisibleDates(
    params: FindVisibleGigsInRangeParams,
  ): Promise<number[]> {
    // Aggregate unique dates without loading full docs.
    const rows = await this.gigModel
      .aggregate<{ _id: number }>([
        { $match: this.buildVisibleRangeFilter(params) },
        { $group: { _id: '$date' } },
        { $sort: { _id: 1 } },
      ])
      .allowDiskUse(true);
    return rows.map((row) => row._id);
  }

  private buildVisibleRangeFilter(
    params: FindVisibleGigsInRangeParams,
  ): QueryFilter<GigDocument> {
    const date: { $gte: number; $lte?: number } = { $gte: params.from };
    if (params.to !== undefined) {
      date.$lte = params.to;
    }
    return { ...this.buildVisibleLocationFilter(params), date };
  }

  private buildFeedVisibleFilter(
    params: FindVisibleGigsInRangeParams,
  ): QueryFilter<GigDocument> {
    // Feed list: include today and multi-day gigs until `endDate` (inclusive).
    const filters: QueryFilter<GigDocument>[] = [
      {
        $or: [
          { date: { $gte: params.from } },
          { endDate: { $gte: params.from } },
        ],
      },
    ];
    if (params.to !== undefined) {
      filters.push({ date: { $lte: params.to } });
    }
    return {
      ...this.buildVisibleLocationFilter(params),
      ...(filters.length === 1 ? filters[0] : { $and: filters }),
    };
  }

  private buildVisibleLocationFilter(
    params: Pick<FindVisibleGigsInRangeParams, 'city' | 'country'>,
  ): QueryFilter<GigDocument> {
    const filter: QueryFilter<GigDocument> = { isVisible: true };
    if (params.city !== undefined && params.country !== undefined) {
      filter.city = params.city;
      filter.country = params.country;
    }
    return filter;
  }

  private toObjectId(gigId: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(gigId)) {
      throw new Error(`Invalid Gig id: ${gigId}`);
    }
    return new Types.ObjectId(gigId);
  }
}
