import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model, UpdateQuery } from 'mongoose';
import type {
  GigCalendarSource,
  GigFormInput,
  GigId,
  PlainGig,
} from './types/gig.types';
import { Gig, GigPoster } from './gig.schema';
import type { GigDocument } from './gig.schema';
import type {
  V1GigGetRequestQuery,
  V1GetGigsResponseBody,
} from './types/requests/v1-gig-get-request';
import type {
  V1GigDatesGetRequestQuery,
  V1GigDatesGetResponseBody,
} from './types/requests/v1-gig-dates-get-request';
import type {
  V1GigAroundGetRequestQuery,
  V1GigAroundGetResponseBody,
} from './types/requests/v1-gig-around-get-request';
import type {
  V1GigByPublicIdGetInput,
  V1GigByPublicIdGetResponseBody,
} from './types/requests/v1-gig-by-public-id-get-request';
import {
  buildFeedVisibleDateClause,
  startOfTodayMs,
} from './types/requests/v1-gig-date-range.shared';
import { envBool } from '../../shared/utils/env';
import { CalendarService } from '../calendar/calendar.service';
import type { CalendarishEvent } from '../calendar/calendar.service';
import { GigPosterService } from './gig.poster.service';
import { TelegramService } from '../telegram/telegram.service';
import { BucketService } from '../bucket/bucket.service';
import { PostType } from '../../shared/types/post-type.enum';
import { Messenger } from '../../shared/types/messenger.enum';
import {
  ADMIN_GIG_LIST_DEFAULT_SORT_ORDER,
  AdminGigListSortBy,
  AdminGigListSortOrder,
} from './types/admin-gig-list-sort.types';
import { decodeGigCursorOrThrow, encodeGigCursor } from './utils/gig-cursor';

interface ResolvePublicPostUrl {
  postId?: number;
  chatId?: number;
}

interface UpdateGigByPublicIdPayload {
  publicId: string;
  expectedVersion: number;
  gig: GigFormInput;
  posterFile: Express.Multer.File | undefined;
}

export interface UpdateGigVisibilityByPublicIdParams {
  publicId: string;
  expectedVersion: number;
  isVisible: boolean;
}

export interface GigTelegramPostInput {
  id: number;
  chatId: number;
  date: number;
  fileId?: string;
}

export interface AppendGigMainPostParams {
  gigId: GigId;
  expectedVersion: number;
  post: GigTelegramPostInput;
}

export interface UpdateGigTelegramPostFileIdParams {
  gigId: GigId;
  expectedVersion: number;
  type: PostType;
  fileId: string;
}

export interface GenerateUniquePublicIdPayload {
  title: string;
  yyyyMmDd: string;
  excludeMongoId?: Types.ObjectId;
  isPublicIdTaken?: (publicId: string) => Promise<boolean>;
}

interface GigVisibleBaseFilterParams {
  readonly from: number;
  readonly to?: number;
  readonly city?: string;
  readonly country?: string;
}

interface GigVisibleInclusiveMsRangeParams {
  readonly fromMs: number;
  readonly toMs: number;
}

export interface GetGigsParams {
  readonly limit: number;
  readonly sortBy?: AdminGigListSortBy;
  readonly sortOrder?: AdminGigListSortOrder;
}

@Injectable()
export class GigService {
  private static readonly MAX_PUBLIC_ID_LEN = 64;
  private static readonly MAX_LIMIT = 100;

  constructor(
    @InjectModel(Gig.name) private gigModel: Model<Gig>,
    private readonly calendarService: CalendarService,
    private readonly gigPosterService: GigPosterService,
    private readonly bucketService: BucketService,
    private readonly telegramService: TelegramService,
  ) {}

  private normalizeAndValidatePublicIdOrThrow(publicId: string): string {
    const id = (publicId ?? '').trim();
    if (!id) {
      throw new BadRequestException('publicId is required');
    }
    if (id.length > GigService.MAX_PUBLIC_ID_LEN) {
      throw new BadRequestException(
        `publicId is too long (max ${GigService.MAX_PUBLIC_ID_LEN})`,
      );
    }
    // Keep it strict and URL/anchor safe (also matches our generator).
    if (!/^[a-z0-9-]+$/.test(id)) {
      throw new BadRequestException('publicId has invalid characters');
    }
    return id;
  }

  private validateExpectedVersion(expectedVersion: number): void {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new BadRequestException(
        'expectedVersion must be a non-negative integer',
      );
    }
  }

  private async throwGigVersionConflictOrNotFound(
    publicId: string,
  ): Promise<never> {
    const existingGig = await this.gigModel.exists({ publicId });
    if (!existingGig) {
      throw new NotFoundException(`Gig with publicId "${publicId}" not found`);
    }

    throw new ConflictException(
      `Gig with publicId "${publicId}" has a newer version`,
    );
  }

  async generateUniquePublicId(
    input: GenerateUniquePublicIdPayload,
  ): Promise<string> {
    const slugifyTitle = (rawTitle: string): string => {
      const str0 = (rawTitle ?? '').trim().toLowerCase();
      const str1 = str0
        .normalize('NFKD')
        // Remove diacritics (ASCII-friendly)
        .replace(/[\u0300-\u036f]/g, '');

      // Replace common separators with spaces to avoid accidental concatenations.
      const str2 = str1.replace(/[&+]/g, ' ');

      // Keep only a-z0-9 and convert any other run to a hyphen.
      const str3 = str2
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      return str3 || 'gig';
    };
    const yyyyMmDd = String(input.yyyyMmDd ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
      throw new BadRequestException(
        'Invalid yyyyMmDd format (expected YYYY-MM-DD)',
      );
    }

    const buildCandidate = (n: number): string => {
      const suffix = n === 0 ? '' : `-${n + 1}`;
      const reserved = 1 + yyyyMmDd.length + suffix.length; // "-" + date + suffix
      const maxSlugLen = Math.max(1, GigService.MAX_PUBLIC_ID_LEN - reserved);

      let slug = slugifyTitle(input.title);
      if (slug.length > maxSlugLen) {
        slug = slug.slice(0, maxSlugLen).replace(/-+$/g, '');
      }
      if (!slug) slug = 'gig';

      const candidate = `${slug}-${yyyyMmDd}${suffix}`;
      // Safety guard (shouldn't happen, but keeps contract tight)
      return candidate.length > GigService.MAX_PUBLIC_ID_LEN
        ? candidate.slice(0, GigService.MAX_PUBLIC_ID_LEN).replace(/-+$/g, '')
        : candidate;
    };

    for (let n = 0; n < 50; n++) {
      const candidate = buildCandidate(n);
      const isTaken = input.isPublicIdTaken
        ? await input.isPublicIdTaken(candidate)
        : Boolean(
            await this.gigModel
              .findOne(
                {
                  publicId: candidate,
                  ...(input.excludeMongoId
                    ? { _id: { $ne: input.excludeMongoId } }
                    : {}),
                },
                { _id: 1 },
              )
              .lean(),
          );
      if (!isTaken) return candidate;
    }

    // Extremely unlikely fallback: add a short random suffix.
    const rnd = Math.random().toString(36).slice(2, 8);
    // Ensure fallback respects MAX_PUBLIC_ID_LEN
    const prefixMax = Math.max(
      1,
      GigService.MAX_PUBLIC_ID_LEN - (1 + rnd.length),
    );
    const prefix = buildCandidate(0).slice(0, prefixMax).replace(/-+$/g, '');
    return `${prefix}-${rnd}`;
  }

  getGigCount(): Promise<number> {
    return this.gigModel.countDocuments({}).exec();
  }

  getVisibleGigCount(): Promise<number> {
    return this.gigModel.countDocuments({ isVisible: true }).exec();
  }

  // TODO: limit|infinite scroll
  getGigs(params: GetGigsParams): Promise<PlainGig[]> {
    const limit = Math.min(Math.max(1, params.limit), GigService.MAX_LIMIT);
    let query = this.gigModel.find({});

    if (params.sortBy !== undefined) {
      const sortOrder = params.sortOrder ?? ADMIN_GIG_LIST_DEFAULT_SORT_ORDER;
      const sortDirection: 1 | -1 =
        sortOrder === AdminGigListSortOrder.Asc ? 1 : -1;

      switch (params.sortBy) {
        case AdminGigListSortBy.CreatedAt:
          query = query.sort({ createdAt: sortDirection, _id: sortDirection });
          break;
        case AdminGigListSortBy.EventDate:
          query = query.sort({ date: sortDirection, _id: sortDirection });
          break;
        default:
          throw new BadRequestException(
            `Unsupported admin gig list sortBy: ${params.sortBy}`,
          );
      }
    }

    return query.limit(limit).lean().exec();
  }

  resolveGigPosterPublicUrl(poster: GigDocument['poster']): string | undefined {
    const externalFallbackEnabled = envBool(
      'EXTERNAL_POSTER_URL_FALLBACK_ENABLED',
      true,
    );

    return (
      (poster?.bucketPath
        ? this.bucketService.getPublicFileUrl(poster.bucketPath)
        : undefined) ??
      (externalFallbackEnabled ? poster?.externalUrl : undefined)
    );
  }

  async updateGigByPublicId(
    payload: UpdateGigByPublicIdPayload,
  ): Promise<GigDocument> {
    const { publicId, expectedVersion, gig, posterFile } = payload;

    const id = this.normalizeAndValidatePublicIdOrThrow(publicId);
    this.validateExpectedVersion(expectedVersion);

    const dateMs = new Date(gig.date).getTime();

    const endDateMs =
      gig.endDate && gig.endDate !== gig.date
        ? new Date(gig.endDate).getTime()
        : undefined;

    const poster: GigPoster | undefined = await this.uploadPoster({
      url: gig.posterUrl,
      file: posterFile,
      context: {
        date: gig.date,
        city: gig.city,
        country: gig.country,
        publicId,
      },
    });

    const dataToUpdate: UpdateQuery<Gig> = {
      $set: {
        title: gig.title,
        date: dateMs,
        city: gig.city,
        country: gig.country,
        venue: gig.venue,
        ticketsUrl: gig.ticketsUrl,
      },
      $inc: { version: 1 },
    };

    if (endDateMs) {
      dataToUpdate.$set = { ...dataToUpdate.$set, endDate: endDateMs };
    } else {
      dataToUpdate.$unset = { ...(dataToUpdate.$unset ?? {}), endDate: 1 };
    }

    if (poster) {
      dataToUpdate.$set = { ...dataToUpdate.$set, poster };
    }

    const updated = await this.gigModel.findOneAndUpdate(
      { publicId: id, version: expectedVersion },
      dataToUpdate,
      { returnDocument: 'after' },
    );
    if (!updated) {
      return this.throwGigVersionConflictOrNotFound(id);
    }
    return updated;
  }

  async updateGigVisibilityByPublicId(
    params: UpdateGigVisibilityByPublicIdParams,
  ): Promise<GigDocument> {
    const publicId = this.normalizeAndValidatePublicIdOrThrow(params.publicId);
    this.validateExpectedVersion(params.expectedVersion);

    const updated = await this.gigModel.findOneAndUpdate(
      { publicId, version: params.expectedVersion },
      {
        $set: { isVisible: params.isVisible },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) {
      return this.throwGigVersionConflictOrNotFound(publicId);
    }

    return updated;
  }

  /** Full Gig form fields by public ID, including hidden Gigs. */
  async getGigByPublicId(publicId: string): Promise<PlainGig> {
    const id = this.normalizeAndValidatePublicIdOrThrow(publicId);
    const gig = await this.gigModel.findOne({ publicId: id }).lean().exec();
    if (!gig) {
      throw new NotFoundException(`Gig with publicId "${id}" not found`);
    }
    return gig;
  }

  async getGigById(gigId: GigId): Promise<PlainGig> {
    if (!Types.ObjectId.isValid(gigId)) {
      throw new BadRequestException(`Invalid MongoDB ID: ${gigId}`);
    }
    const gig = await this.gigModel.findById(gigId).lean().exec();
    if (!gig) {
      throw new NotFoundException(`Gig with ID ${gigId} not found`);
    }
    return gig;
  }

  async getGigsByIds(gigIds: readonly GigId[]): Promise<PlainGig[]> {
    const uniqueGigIdsByString = new Map<string, Types.ObjectId>();
    for (const gigId of gigIds) {
      if (!Types.ObjectId.isValid(gigId)) {
        throw new BadRequestException(`Invalid MongoDB ID: ${gigId}`);
      }
      const gigIdString = gigId.toString();
      uniqueGigIdsByString.set(gigIdString, new Types.ObjectId(gigIdString));
    }

    if (uniqueGigIdsByString.size === 0) {
      return [];
    }

    const gigs = await this.gigModel
      .find({ _id: { $in: [...uniqueGigIdsByString.values()] } })
      .lean()
      .exec();
    const gigsById = new Map(gigs.map((gig) => [gig._id.toString(), gig]));
    const orderedGigs: PlainGig[] = [];
    const missingGigIds: string[] = [];
    for (const gigId of uniqueGigIdsByString.keys()) {
      const gig = gigsById.get(gigId);
      if (gig) {
        orderedGigs.push(gig);
      } else {
        missingGigIds.push(gigId);
      }
    }
    if (missingGigIds.length > 0) {
      throw new NotFoundException(
        `Gigs with IDs ${missingGigIds.join(', ')} not found`,
      );
    }

    return orderedGigs;
  }

  async appendGigMainPost(
    params: AppendGigMainPostParams,
  ): Promise<GigDocument> {
    if (!Types.ObjectId.isValid(params.gigId)) {
      throw new BadRequestException(`Invalid MongoDB ID: ${params.gigId}`);
    }
    this.validateExpectedVersion(params.expectedVersion);

    const updated = await this.gigModel.findOneAndUpdate(
      {
        _id: params.gigId,
        version: params.expectedVersion,
        posts: {
          $not: {
            $elemMatch: { to: Messenger.Telegram, type: PostType.Main },
          },
        },
      },
      {
        $push: {
          posts: {
            ...params.post,
            to: Messenger.Telegram,
            type: PostType.Main,
          },
        },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
    if (updated) {
      return updated;
    }

    const gig = await this.getGigById(params.gigId);
    if (gig.version !== params.expectedVersion) {
      throw new ConflictException(
        `Gig with ID "${params.gigId}" has a newer version`,
      );
    }
    if (this.telegramService.pickTgPost(gig.posts, PostType.Main)) {
      throw new ConflictException('Gig main post already exists');
    }
    throw new ConflictException(
      `Gig with ID "${params.gigId}" changed while storing the main post`,
    );
  }

  async updateGigTelegramPostFileId(
    params: UpdateGigTelegramPostFileIdParams,
  ): Promise<GigDocument> {
    if (!Types.ObjectId.isValid(params.gigId)) {
      throw new BadRequestException(`Invalid MongoDB ID: ${params.gigId}`);
    }
    this.validateExpectedVersion(params.expectedVersion);

    const updated = await this.gigModel.findOneAndUpdate(
      {
        _id: params.gigId,
        version: params.expectedVersion,
        posts: {
          $elemMatch: { to: Messenger.Telegram, type: params.type },
        },
      },
      {
        $set: { 'posts.$.fileId': params.fileId },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) {
      const gig = await this.getGigById(params.gigId);
      if (gig.version !== params.expectedVersion) {
        throw new ConflictException(
          `Gig with ID "${params.gigId}" has a newer version`,
        );
      }
      throw new NotFoundException(
        `Gig with ID "${params.gigId}" has no ${params.type} Telegram post`,
      );
    }
    return updated;
  }

  async resolvePublicPostUrl(
    payload: ResolvePublicPostUrl,
  ): Promise<string | undefined> {
    const { postId, chatId } = payload;

    if (!chatId) {
      return;
    }

    const chatUsername = chatId
      ? await this.telegramService.getChatUsername(chatId)
      : undefined;

    return chatUsername && postId
      ? this.telegramService.getPostUrl({
          chatUsername,
          messageId: postId,
        })
      : undefined;
  }

  /**
   * Maps stored gigs to the same public shape as list endpoints (calendar URLs, poster URLs, etc.).
   * Exposed for DigestModule and other internal callers that query gigs directly.
   */
  async mapGigsToV1Gigs(
    gigs: GigDocument[],
  ): Promise<V1GetGigsResponseBody['gigs']> {
    const externalFallbackEnabled = envBool(
      'EXTERNAL_POSTER_URL_FALLBACK_ENABLED',
      true,
    );

    const mapped: V1GetGigsResponseBody['gigs'] = [];
    for (const gig of gigs) {
      const post = this.telegramService.pickTgPost(gig.posts, PostType.Main);

      const postUrl = await this.resolvePublicPostUrl({
        postId: post?.id,
        chatId: post?.chatId,
      });

      const calendarPayload = this.gigToCalendarPayload(gig);
      const calendarUrl =
        this.calendarService.getCreateCalendarEventUrl(calendarPayload);

      mapped.push({
        id: gig.publicId,
        title: gig.title,
        date: gig.date.toString(), // TODO
        endDate: gig.endDate?.toString(),
        city: gig.city,
        country: gig.country,
        venue: gig.venue,
        ticketsUrl: gig.ticketsUrl,
        calendarUrl,
        postUrl,
        posterUrl:
          (gig.poster?.bucketPath
            ? this.bucketService.getPublicFileUrl(gig.poster.bucketPath)
            : undefined) ??
          (externalFallbackEnabled ? gig.poster?.externalUrl : undefined),
      });
    }

    return mapped;
  }

  private buildVisibleGigsBaseFilter(
    params: GigVisibleBaseFilterParams,
  ): Record<string, unknown> {
    const { from, to, city, country } = params;

    const dateFilter: { $gte: number; $lte?: number } = { $gte: from };
    if (to !== undefined) dateFilter.$lte = to;

    const baseFilter: Record<string, unknown> = {
      isVisible: true,
      date: dateFilter,
    };
    if (city && country) {
      baseFilter.city = city;
      baseFilter.country = country;
    }

    return baseFilter;
  }

  /** Feed list: include today and multi-day gigs until `endDate` (inclusive). */
  private buildFeedVisibleGigsBaseFilter(
    params: GigVisibleBaseFilterParams,
  ): Record<string, unknown> {
    const { from, to, city, country } = params;

    const and: Record<string, unknown>[] = [buildFeedVisibleDateClause(from)];
    if (to !== undefined) {
      and.push({ date: { $lte: to } });
    }

    const baseFilter: Record<string, unknown> = {
      isVisible: true,
      ...(and.length === 1 ? and[0] : { $and: and }),
    };
    if (city && country) {
      baseFilter.city = city;
      baseFilter.country = country;
    }

    return baseFilter;
  }

  /**
   * Visible gigs in `[fromMs, toMs]` by gig `date`, ascending, same filter rules as v1 list (no cursor).
   */
  async getVisibleGigDocumentsInInclusiveMsRange(
    params: GigVisibleInclusiveMsRangeParams,
  ): Promise<GigDocument[]> {
    const filter = this.buildVisibleGigsBaseFilter({
      from: params.fromMs,
      to: params.toMs,
    });

    return this.gigModel
      .find(filter)
      .collation({ locale: 'en', strength: 2 })
      .sort({ date: 1, _id: 1 })
      .exec();
  }

  // TODO: no versioning should be in services
  async getVisibleGigsV1(
    query: V1GigGetRequestQuery,
  ): Promise<V1GetGigsResponseBody> {
    const {
      limit = 100,
      cursor,
      from,
      to,
      city,
      country,
      direction = 'next',
    } = query;

    if (to !== undefined && to < from) {
      throw new BadRequestException('to must be >= from');
    }

    if (limit > GigService.MAX_LIMIT) {
      throw new BadRequestException(
        `Size limit exceeded. Maximum size is ${GigService.MAX_LIMIT}.`,
      );
    }

    const baseFilter = this.buildFeedVisibleGigsBaseFilter({
      from,
      to,
      city,
      country,
    });

    const and: Record<string, unknown>[] = [baseFilter];

    if (cursor) {
      const decoded = decodeGigCursorOrThrow(cursor);
      const cursorId = new Types.ObjectId(decoded.mongoId);
      and.push(
        direction === 'prev'
          ? {
              $or: [
                { date: { $lt: decoded.date } },
                { date: decoded.date, _id: { $lt: cursorId } },
              ],
            }
          : {
              $or: [
                { date: { $gt: decoded.date } },
                { date: decoded.date, _id: { $gt: cursorId } },
              ],
            },
      );
    }

    const filter: Record<string, unknown> =
      and.length === 1 ? and[0] : { $and: and };

    const sort: Record<string, 1 | -1> =
      direction === 'prev' ? { date: -1, _id: -1 } : { date: 1, _id: 1 };

    const docs = await this.gigModel
      .find(filter)
      .collation({ locale: 'en', strength: 2 })
      .sort(sort)
      .limit(limit + 1);

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;

    // Keep the public API consistent: always return gigs ordered ascending.
    const gigsAsc = direction === 'prev' ? page.slice().reverse() : page;
    const mapped = await this.mapGigsToV1Gigs(gigsAsc);

    if (direction === 'prev') {
      const prevCursor =
        hasMore && gigsAsc.length > 0
          ? encodeGigCursor({
              date: gigsAsc[0].date,
              mongoId: String(gigsAsc[0]._id),
            })
          : undefined;

      return { gigs: mapped, prevCursor };
    }

    // Provide a cursor for loading items before the current window without additional lookups.
    // Note: this cursor does NOT guarantee that earlier items exist.
    const prevCursor =
      gigsAsc.length > 0
        ? encodeGigCursor({
            date: gigsAsc[0].date,
            mongoId: String(gigsAsc[0]._id),
          })
        : undefined;

    const nextCursor =
      hasMore && gigsAsc.length > 0
        ? encodeGigCursor({
            date: gigsAsc[gigsAsc.length - 1].date,
            mongoId: String(gigsAsc[gigsAsc.length - 1]._id),
          })
        : undefined;

    return { gigs: mapped, prevCursor, nextCursor };
  }

  /**
   * Visible gig anchor date for hash / deep-link resolution (feed client). Body: `{ date }` only.
   */
  async getGigDateByPublicId(
    input: V1GigByPublicIdGetInput,
  ): Promise<V1GigByPublicIdGetResponseBody> {
    const publicId = this.normalizeAndValidatePublicIdOrThrow(input.publicId);

    const filter: Record<string, unknown> = {
      publicId,
      isVisible: true,
    };

    const doc = await this.gigModel
      .findOne(filter)
      .collation({ locale: 'en', strength: 2 });

    if (!doc) {
      throw new NotFoundException(`Gig with publicId "${publicId}" not found`);
    }

    return {
      date: doc.date.toString(),
    };
  }

  async getVisibleGigsAroundV1(
    query: V1GigAroundGetRequestQuery,
  ): Promise<V1GigAroundGetResponseBody> {
    const {
      anchor,
      beforeLimit = 100,
      afterLimit = 100,
      city,
      country,
    } = query;

    if (
      beforeLimit > GigService.MAX_LIMIT ||
      afterLimit > GigService.MAX_LIMIT
    ) {
      throw new BadRequestException(
        `Size limit exceeded. Maximum size is ${GigService.MAX_LIMIT}.`,
      );
    }

    const baseFilter: Record<string, unknown> = {
      isVisible: true,
    };
    if (city && country) {
      baseFilter.city = city;
      baseFilter.country = country;
    }

    const beforeDocsDesc =
      beforeLimit === 0
        ? []
        : await this.gigModel
            .find({
              ...baseFilter,
              date: { $gte: startOfTodayMs(), $lt: anchor },
            })
            .collation({ locale: 'en', strength: 2 })
            .sort({ date: -1, _id: -1 })
            .limit(beforeLimit + 1);

    const hasPrev = beforeDocsDesc.length > beforeLimit;
    const beforeDesc = hasPrev
      ? beforeDocsDesc.slice(0, beforeLimit)
      : beforeDocsDesc;
    const beforeDocsAsc = beforeDesc.slice().reverse();

    const afterDocsAsc0 = await this.gigModel
      .find({
        ...baseFilter,
        date: { $gte: anchor },
      })
      .collation({ locale: 'en', strength: 2 })
      .sort({ date: 1, _id: 1 })
      .limit(afterLimit + 1);

    const hasNext = afterDocsAsc0.length > afterLimit;
    const afterDocsAsc = hasNext
      ? afterDocsAsc0.slice(0, afterLimit)
      : afterDocsAsc0;

    const before = await this.mapGigsToV1Gigs(beforeDocsAsc);
    const after = await this.mapGigsToV1Gigs(afterDocsAsc);

    const prevCursor =
      hasPrev && beforeDocsAsc.length > 0
        ? encodeGigCursor({
            date: beforeDocsAsc[0].date,
            mongoId: String(beforeDocsAsc[0]._id),
          })
        : undefined;

    const nextCursor =
      hasNext && afterDocsAsc.length > 0
        ? encodeGigCursor({
            date: afterDocsAsc[afterDocsAsc.length - 1].date,
            mongoId: String(afterDocsAsc[afterDocsAsc.length - 1]._id),
          })
        : undefined;

    return { before, after, prevCursor, nextCursor };
  }

  async getVisibleGigDatesV1(
    query: V1GigDatesGetRequestQuery,
  ): Promise<V1GigDatesGetResponseBody> {
    const { from, to, city, country } = query;

    if (to !== undefined && to < from) {
      throw new BadRequestException('to must be >= from');
    }

    const dateFilter: { $gte: number; $lte?: number } = { $gte: from };
    if (to !== undefined) dateFilter.$lte = to;

    const filter: Record<string, unknown> = {
      isVisible: true,
      date: dateFilter,
    };

    if (city && country) {
      filter.city = city;
      filter.country = country;
    }

    // Aggregate unique dates without loading full docs.
    const rows = await this.gigModel
      .aggregate<{
        _id: number;
      }>([
        { $match: filter },
        { $group: { _id: '$date' } },
        { $sort: { _id: 1 } },
      ])
      .allowDiskUse(true);

    return {
      dates: rows.map((r) => String(r._id)),
    };
  }

  gigToCalendarPayload(gig: GigCalendarSource): CalendarishEvent {
    const timeZone = 'Europe/Madrid';

    // Set start time to 8:00 PM
    const startDateTime = new Date(gig.date);
    startDateTime.setHours(20, 0, 0, 0); // 20:00

    // Calculate end time (2 hours later)
    const getDefaultEndDateTime = () =>
      new Date(startDateTime.getTime() + 2 * 60 * 60 * 1000);

    // If `endDate` exists (multi-day event), end on the last day.
    // We still default to an evening time window.
    const endDateTime = (() => {
      if (!gig.endDate) return getDefaultEndDateTime();

      const end = new Date(gig.endDate);
      end.setHours(22, 0, 0, 0); // 22:00 (20:00 + 2h)

      // Safety: never return an end before the start.
      return end.getTime() > startDateTime.getTime()
        ? end
        : getDefaultEndDateTime();
    })();

    return {
      title: gig.title,
      description: `Tickets: ${gig.ticketsUrl}`,
      location: [gig.venue, gig.city, gig.country] // TODO: add country name?
        .filter((str) => !!str)
        .join(', '),
      start: startDateTime,
      end: endDateTime,
      timeZone,
    };
  }

  private uploadPoster: GigPosterService['upload'] =
    this.gigPosterService.upload.bind(this.gigPosterService);
}
