import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PlainGig } from '../types/gig.types';
import { startOfTodayMs } from '../types/requests/v1-gig-date-range.shared';
import { decodeGigCursorOrThrow, encodeGigCursor } from '../utils/gig-cursor';
import { GIG_REPOSITORY } from '../repositories/gig.repository';
import type {
  FindVisibleGigsAroundParams,
  FindVisibleGigDatesParams,
  FindVisibleGigsPageParams,
  GigRepository,
} from '../repositories/gig.repository';
import { GigService } from '../gig.service';
import { TelegramGigService } from '../../telegram/telegram-gig/telegram-gig.service';
import { CalendarService } from '../../calendar/calendar.service';
import { PostType } from '@shared/types/post-type.enum';
import { CommunityService } from '@modules/community/community.service';

export interface GigVisibleInclusiveMsRangeParams {
  fromMs: number;
  toMs: number;
}

export interface GetVisibleGigsParams {
  direction?: 'next' | 'prev';
  cursor?: string;
  limit?: number;
  from: number;
  to?: number;
  communitySlug: string;
  countryIso: string;
}

export interface GetVisibleGigsAroundParams {
  anchor: number;
  beforeLimit?: number;
  afterLimit?: number;
  communitySlug: string;
  countryIso: string;
}

export interface GetVisibleGigDatesParams {
  from: number;
  to?: number;
  communitySlug: string;
  countryIso: string;
}

export interface GetVisibleGigDateByPublicIdParams {
  publicId: string;
}

interface ResolveActiveCommunityIdParams {
  countryIso: string;
  communitySlug: string;
}

export interface GigFeedItem {
  id: string;
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue: string;
  ticketsUrl: string;
  calendarUrl: string;
  posterUrl?: string;
  postUrl?: string;
}

export interface GetVisibleGigsResult {
  gigs: GigFeedItem[];
  prevCursor?: string;
  nextCursor?: string;
}

export interface GetVisibleGigsAroundResult {
  before: GigFeedItem[];
  after: GigFeedItem[];
  prevCursor?: string;
  nextCursor?: string;
}

export interface GetVisibleGigDatesResult {
  dates: number[];
}

export interface GetVisibleGigDateByPublicIdResult {
  date: number;
}

@Injectable()
export class GigFeedService {
  private static readonly MAX_LIMIT = 100;

  constructor(
    @Inject(GIG_REPOSITORY)
    private readonly gigRepository: GigRepository,
    private readonly gigService: GigService,
    private readonly telegramGigService: TelegramGigService,
    private readonly calendarService: CalendarService,
    private readonly communityService: CommunityService,
  ) {}

  /** Maps domain Gigs to enriched public feed items. */
  private async mapGigs(gigs: PlainGig[]): Promise<GigFeedItem[]> {
    const mapped: GigFeedItem[] = [];
    for (const gig of gigs) {
      const post = this.telegramGigService.pickPost(gig.posts, PostType.Main);
      const postUrl = await this.telegramGigService.resolveMainPostUrl(post);
      const calendarPayload = this.gigService.gigToCalendarPayload(gig);
      const calendarUrl =
        this.calendarService.getCreateCalendarEventUrl(calendarPayload);

      mapped.push({
        id: gig.publicId,
        title: gig.title,
        date: gig.date,
        endDate: gig.endDate,
        city: gig.city,
        country: gig.country,
        venue: gig.venue,
        ticketsUrl: gig.ticketsUrl,
        calendarUrl,
        postUrl,
        posterUrl: this.gigService.resolveGigPosterPublicUrl(gig.poster),
      });
    }

    return mapped;
  }

  /**
   * Visible gigs in `[fromMs, toMs]` by gig `date`, ascending, using public feed filters without pagination.
   */
  getVisibleGigsInInclusiveMsRange(
    params: GigVisibleInclusiveMsRangeParams,
  ): Promise<PlainGig[]> {
    return this.gigRepository.findVisibleInRange({
      from: params.fromMs,
      to: params.toMs,
    });
  }

  async getVisibleGigs(
    query: GetVisibleGigsParams,
  ): Promise<GetVisibleGigsResult> {
    const {
      limit = 100,
      cursor,
      from,
      to,
      communitySlug,
      countryIso,
      direction = 'next',
    } = query;

    if (to !== undefined && to < from) {
      throw new BadRequestException('to must be >= from');
    }

    if (limit > GigFeedService.MAX_LIMIT) {
      throw new BadRequestException(
        `Size limit exceeded. Maximum size is ${GigFeedService.MAX_LIMIT}.`,
      );
    }

    const communityId = await this.resolveActiveCommunityId({
      countryIso,
      communitySlug,
    });

    const findVisibleGigsPageParams: FindVisibleGigsPageParams = {
      from,
      limit,
      direction,
      communityId,
    };
    if (to !== undefined) {
      findVisibleGigsPageParams.to = to;
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
    const mapped = await this.mapGigs(gigsAsc);

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
  async getVisibleGigDateByPublicId(
    input: GetVisibleGigDateByPublicIdParams,
  ): Promise<GetVisibleGigDateByPublicIdResult> {
    const publicId = this.gigService.normalizeAndValidatePublicId(
      input.publicId,
    );

    const date = await this.gigRepository.findVisibleDateByPublicId(publicId);
    if (date === null) {
      throw new NotFoundException(`Gig with publicId "${publicId}" not found`);
    }

    return {
      date,
    };
  }

  async getVisibleGigsAround(
    query: GetVisibleGigsAroundParams,
  ): Promise<GetVisibleGigsAroundResult> {
    const {
      anchor,
      beforeLimit = 100,
      afterLimit = 100,
      communitySlug,
      countryIso,
    } = query;

    if (
      beforeLimit > GigFeedService.MAX_LIMIT ||
      afterLimit > GigFeedService.MAX_LIMIT
    ) {
      throw new BadRequestException(
        `Size limit exceeded. Maximum size is ${GigFeedService.MAX_LIMIT}.`,
      );
    }

    const communityId = await this.resolveActiveCommunityId({
      countryIso,
      communitySlug,
    });

    const findVisibleGigsAroundParams: FindVisibleGigsAroundParams = {
      anchor,
      todayStart: startOfTodayMs(),
      beforeLimit,
      afterLimit,
      communityId,
    };

    const result = await this.gigRepository.findVisibleAround(
      findVisibleGigsAroundParams,
    );
    const before = await this.mapGigs(result.before);
    const after = await this.mapGigs(result.after);

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

  async getVisibleGigDates(
    query: GetVisibleGigDatesParams,
  ): Promise<GetVisibleGigDatesResult> {
    const { from, to, communitySlug, countryIso } = query;

    if (to !== undefined && to < from) {
      throw new BadRequestException('to must be >= from');
    }

    const communityId = await this.resolveActiveCommunityId({
      countryIso,
      communitySlug,
    });

    const findVisibleGigsInRangeParams: FindVisibleGigDatesParams = {
      from,
      communityId,
    };
    if (to !== undefined) {
      findVisibleGigsInRangeParams.to = to;
    }

    const dates = await this.gigRepository.findVisibleDates(
      findVisibleGigsInRangeParams,
    );

    return {
      dates,
    };
  }

  private async resolveActiveCommunityId(
    params: ResolveActiveCommunityIdParams,
  ): Promise<string> {
    const community = await this.communityService.findByRoute({
      countryIso: params.countryIso,
      communitySlug: params.communitySlug,
    });
    if (community === null || !community.isActive) {
      throw new NotFoundException(
        `Active Community "${params.countryIso}/${params.communitySlug}" not found`,
      );
    }
    return community.id;
  }
}
