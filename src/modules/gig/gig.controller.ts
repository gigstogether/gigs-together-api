import { Controller, Get, Param, Query, Version } from '@nestjs/common';
import { GigFeedService } from './gig-feed.service';
import { V1GigGetRequestQuery } from './types/requests/v1-gig-get-request';
import type { V1GetGigsResponseBody } from './types/requests/v1-gig-get-request';
import { V1GigDatesGetRequestQuery } from './types/requests/v1-gig-dates-get-request';
import type { V1GigDatesGetResponseBody } from './types/requests/v1-gig-dates-get-request';
import { V1GigAroundGetRequestQuery } from './types/requests/v1-gig-around-get-request';
import type { V1GigAroundGetResponseBody } from './types/requests/v1-gig-around-get-request';
import { V1GigByPublicIdGetRequestParams } from './types/requests/v1-gig-by-public-id-get-request';
import type { V1GigByPublicIdGetResponseBody } from './types/requests/v1-gig-by-public-id-get-request';
import {
  mapV1GigAroundQuery,
  mapV1GigDatesQuery,
  mapV1GigGetQuery,
  mapVisibleGigDateByPublicIdResultToV1,
  mapVisibleGigDatesResultToV1,
  mapVisibleGigsAroundResultToV1,
  mapVisibleGigsResultToV1,
} from './gig-feed.mapper';

@Controller('gigs')
export class GigController {
  constructor(private readonly gigFeedService: GigFeedService) {}

  @Version('1')
  @Get()
  async getGigsV1(
    @Query() query: V1GigGetRequestQuery,
  ): Promise<V1GetGigsResponseBody> {
    const result = await this.gigFeedService.getVisibleGigs(
      mapV1GigGetQuery(query),
    );
    return mapVisibleGigsResultToV1(result);
  }

  /**
   * Returns all (future) gig dates for the given location.
   * Used to power the calendar day enable/disable state without relying on feed pagination.
   */
  @Version('1')
  @Get('dates')
  async getGigDatesV1(
    @Query() query: V1GigDatesGetRequestQuery,
  ): Promise<V1GigDatesGetResponseBody> {
    const result = await this.gigFeedService.getVisibleGigDates(
      mapV1GigDatesQuery(query),
    );
    return mapVisibleGigDatesResultToV1(result);
  }

  /**
   * Loads a chunk before + a chunk from the anchor date in a single request.
   */
  @Version('1')
  @Get('around')
  async getGigsAroundV1(
    @Query() query: V1GigAroundGetRequestQuery,
  ): Promise<V1GigAroundGetResponseBody> {
    const result = await this.gigFeedService.getVisibleGigsAround(
      mapV1GigAroundQuery(query),
    );
    return mapVisibleGigsAroundResultToV1(result);
  }

  /**
   * Public: anchor calendar date for hash / deep links (`{ date }` only).
   */
  @Version('1')
  @Get('date/:publicId')
  async getGigDateByPublicId(
    @Param() params: V1GigByPublicIdGetRequestParams,
  ): Promise<V1GigByPublicIdGetResponseBody> {
    const result = await this.gigFeedService.getVisibleGigDateByPublicId({
      publicId: params.publicId,
    });
    return mapVisibleGigDateByPublicIdResultToV1(result);
  }
}
