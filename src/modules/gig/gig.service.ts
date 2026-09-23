import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  GigCalendarSource,
  GigFormInput,
  GigId,
  GigPoster,
  PlainGig,
} from './types/gig.types';
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
import { startOfTodayMs } from './types/requests/v1-gig-date-range.shared';
import { envBool } from '../../shared/utils/env';
import { CalendarService } from '../calendar/calendar.service';
import type { CalendarishEvent } from '../calendar/calendar.service';
import { GigPosterService } from './gig.poster.service';
import { TelegramService } from '../telegram/telegram.service';
import { BucketService } from '../bucket/bucket.service';
import { PostType } from '../../shared/types/post-type.enum';
import { Messenger } from '../../shared/types/messenger.enum';
import {
  AdminGigListSortBy,
  AdminGigListSortOrder,
} from './types/admin-gig-list-sort.types';
import { decodeGigCursorOrThrow, encodeGigCursor } from './utils/gig-cursor';
import { GIG_REPOSITORY } from './repositories/gig.repository';
import type {
  FindGigsParams as RepositoryFindGigsParams,
  FindVisibleGigsAroundParams,
  FindVisibleGigsInRangeParams,
  FindVisibleGigsPageParams,
  GigRepository,
} from './repositories/gig.repository';

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
  messageId: number;
  chatId: number;
  fileId: string;
}

export interface GenerateUniquePublicIdPayload {
  title: string;
  yyyyMmDd: string;
  excludeGigId?: string;
  isPublicIdTaken?: (publicId: string) => Promise<boolean>;
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
    @Inject(GIG_REPOSITORY)
    private readonly gigRepository: GigRepository,
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

  private validateGigId(gigId: string): void {
    if (!/^[a-f\d]{24}$/i.test(gigId)) {
      throw new BadRequestException(`Invalid MongoDB ID: ${gigId}`);
    }
  }

  private async throwGigVersionConflictOrNotFound(
    publicId: string,
  ): Promise<never> {
    const hasExistingGig = await this.gigRepository.existsByPublicId(publicId);
    if (!hasExistingGig) {
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
        : await this.gigRepository.isPublicIdTaken({
            publicId: candidate,
            ...(input.excludeGigId !== undefined
              ? { excludeGigId: input.excludeGigId }
              : {}),
          });
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
    return this.gigRepository.countAll();
  }

  getVisibleGigCount(): Promise<number> {
    return this.gigRepository.countVisible();
  }

  // TODO: limit|infinite scroll
  getGigs(params: GetGigsParams): Promise<PlainGig[]> {
    const limit = Math.min(Math.max(1, params.limit), GigService.MAX_LIMIT);
    if (params.sortBy !== undefined) {
      const isSupportedSortBy =
        params.sortBy === AdminGigListSortBy.CreatedAt ||
        params.sortBy === AdminGigListSortBy.EventDate;
      if (!isSupportedSortBy) {
        throw new BadRequestException(
          `Unsupported admin gig list sortBy: ${params.sortBy}`,
        );
      }
    }

    const findGigsParams: RepositoryFindGigsParams = { limit };
    if (params.sortBy !== undefined) {
      findGigsParams.sortBy = params.sortBy;
    }
    if (params.sortOrder !== undefined) {
      findGigsParams.sortOrder = params.sortOrder;
    }

    return this.gigRepository.findMany(findGigsParams);
  }

  resolveGigPosterPublicUrl(poster: GigPoster | undefined): string | undefined {
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
  ): Promise<PlainGig> {
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

    const updated = await this.gigRepository.updateByPublicId({
      publicId: id,
      expectedVersion,
      title: gig.title,
      date: dateMs,
      ...(endDateMs !== undefined ? { endDate: endDateMs } : {}),
      city: gig.city,
      country: gig.country,
      venue: gig.venue,
      ticketsUrl: gig.ticketsUrl,
      ...(poster !== undefined ? { poster } : {}),
    });
    if (!updated) {
      return this.throwGigVersionConflictOrNotFound(id);
    }
    return updated;
  }

  async updateGigVisibilityByPublicId(
    params: UpdateGigVisibilityByPublicIdParams,
  ): Promise<PlainGig> {
    const publicId = this.normalizeAndValidatePublicIdOrThrow(params.publicId);
    this.validateExpectedVersion(params.expectedVersion);

    const updated = await this.gigRepository.updateVisibility({
      publicId,
      expectedVersion: params.expectedVersion,
      isVisible: params.isVisible,
    });
    if (!updated) {
      return this.throwGigVersionConflictOrNotFound(publicId);
    }

    return updated;
  }

  /** Full Gig form fields by public ID, including hidden Gigs. */
  async getGigByPublicId(publicId: string): Promise<PlainGig> {
    const id = this.normalizeAndValidatePublicIdOrThrow(publicId);
    const gig = await this.gigRepository.findByPublicId(id);
    if (!gig) {
      throw new NotFoundException(`Gig with publicId "${id}" not found`);
    }
    return gig;
  }

  async getGigById(gigId: GigId): Promise<PlainGig> {
    this.validateGigId(gigId);
    const gig = await this.gigRepository.findById(gigId);
    if (!gig) {
      throw new NotFoundException(`Gig with ID ${gigId} not found`);
    }
    return gig;
  }

  async getGigsByIds(gigIds: readonly GigId[]): Promise<PlainGig[]> {
    const uniqueGigIds = new Set<string>();
    for (const gigId of gigIds) {
      this.validateGigId(gigId);
      uniqueGigIds.add(gigId);
    }

    if (uniqueGigIds.size === 0) {
      return [];
    }

    const gigs = await this.gigRepository.findByIds([...uniqueGigIds]);
    const gigsById = new Map(gigs.map((gig) => [gig.id, gig]));
    const orderedGigs: PlainGig[] = [];
    const missingGigIds: string[] = [];
    for (const gigId of uniqueGigIds) {
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

  async appendGigMainPost(params: AppendGigMainPostParams): Promise<PlainGig> {
    this.validateGigId(params.gigId);
    this.validateExpectedVersion(params.expectedVersion);

    const updated = await this.gigRepository.appendMainPost({
      gigId: params.gigId,
      expectedVersion: params.expectedVersion,
      post: {
        ...params.post,
        to: Messenger.Telegram,
        type: PostType.Main,
      },
    });
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

  updateGigTelegramPostFileId(
    params: UpdateGigTelegramPostFileIdParams,
  ): Promise<PlainGig | null> {
    this.validateGigId(params.gigId);
    this.validateExpectedVersion(params.expectedVersion);
    if (!Number.isInteger(params.messageId)) {
      throw new BadRequestException('Telegram message ID must be an integer');
    }
    if (!Number.isInteger(params.chatId)) {
      throw new BadRequestException('Telegram chat ID must be an integer');
    }
    if (params.fileId.trim() === '') {
      throw new BadRequestException('Telegram file ID must not be empty');
    }

    return this.gigRepository.updateTelegramPostFileId(params);
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
   * Maps domain gigs to the same public shape as list endpoints (calendar URLs, poster URLs, etc.).
   * Exposed for DigestModule and other internal callers that query gigs.
   */
  async mapGigsToV1Gigs(
    gigs: PlainGig[],
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

  /**
   * Visible gigs in `[fromMs, toMs]` by gig `date`, ascending, same filter rules as v1 list (no cursor).
   */
  getVisibleGigsInInclusiveMsRange(
    params: GigVisibleInclusiveMsRangeParams,
  ): Promise<PlainGig[]> {
    return this.gigRepository.findVisibleInRange({
      from: params.fromMs,
      to: params.toMs,
    });
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

    const findVisibleGigsPageParams: FindVisibleGigsPageParams = {
      from,
      limit,
      direction,
    };
    if (to !== undefined) {
      findVisibleGigsPageParams.to = to;
    }
    if (city !== undefined) {
      findVisibleGigsPageParams.city = city;
    }
    if (country !== undefined) {
      findVisibleGigsPageParams.country = country;
    }
    if (cursor !== undefined) {
      const decodedCursor = decodeGigCursorOrThrow(cursor);
      findVisibleGigsPageParams.cursor = {
        date: decodedCursor.date,
        gigId: decodedCursor.mongoId,
      };
    }

    const page = await this.gigRepository.findVisiblePage(
      findVisibleGigsPageParams,
    );
    const gigsAsc = page.gigs;
    const mapped = await this.mapGigsToV1Gigs(gigsAsc);

    if (direction === 'prev') {
      const prevCursor =
        page.hasMore && gigsAsc.length > 0
          ? encodeGigCursor({
              date: gigsAsc[0].date,
              mongoId: gigsAsc[0].id,
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
            mongoId: gigsAsc[0].id,
          })
        : undefined;

    const nextCursor =
      page.hasMore && gigsAsc.length > 0
        ? encodeGigCursor({
            date: gigsAsc[gigsAsc.length - 1].date,
            mongoId: gigsAsc[gigsAsc.length - 1].id,
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

    const date = await this.gigRepository.findVisibleDateByPublicId(publicId);
    if (date === null) {
      throw new NotFoundException(`Gig with publicId "${publicId}" not found`);
    }

    return {
      date: date.toString(),
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

    const findVisibleGigsAroundParams: FindVisibleGigsAroundParams = {
      anchor,
      todayStart: startOfTodayMs(),
      beforeLimit,
      afterLimit,
    };
    if (city !== undefined) {
      findVisibleGigsAroundParams.city = city;
    }
    if (country !== undefined) {
      findVisibleGigsAroundParams.country = country;
    }

    const result = await this.gigRepository.findVisibleAround(
      findVisibleGigsAroundParams,
    );
    const before = await this.mapGigsToV1Gigs(result.before);
    const after = await this.mapGigsToV1Gigs(result.after);

    const prevCursor =
      result.hasPrevious && result.before.length > 0
        ? encodeGigCursor({
            date: result.before[0].date,
            mongoId: result.before[0].id,
          })
        : undefined;

    const nextCursor =
      result.hasNext && result.after.length > 0
        ? encodeGigCursor({
            date: result.after[result.after.length - 1].date,
            mongoId: result.after[result.after.length - 1].id,
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

    const findVisibleGigsInRangeParams: FindVisibleGigsInRangeParams = {
      from,
    };
    if (to !== undefined) {
      findVisibleGigsInRangeParams.to = to;
    }
    if (city !== undefined) {
      findVisibleGigsInRangeParams.city = city;
    }
    if (country !== undefined) {
      findVisibleGigsInRangeParams.country = country;
    }

    const dates = await this.gigRepository.findVisibleDates(
      findVisibleGigsInRangeParams,
    );

    return {
      dates: dates.map(String),
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
