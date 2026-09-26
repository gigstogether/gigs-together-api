import type {
  GetVisibleGigDatesParams,
  GetVisibleGigDatesResult,
  GetVisibleGigDateByPublicIdResult,
  GetVisibleGigsAroundParams,
  GetVisibleGigsAroundResult,
  GetVisibleGigsParams,
  GetVisibleGigsResult,
  GigFeedItem,
} from './gig-feed.service';
import type { V1GetGigsResponseBodyGig } from './types/gig.types';
import type {
  V1GigAroundGetRequestQuery,
  V1GigAroundGetResponseBody,
} from './types/requests/v1-gig-around-get-request';
import type {
  V1GigDatesGetRequestQuery,
  V1GigDatesGetResponseBody,
} from './types/requests/v1-gig-dates-get-request';
import type {
  V1GetGigsResponseBody,
  V1GigGetRequestQuery,
} from './types/requests/v1-gig-get-request';
import type { V1GigByPublicIdGetResponseBody } from './types/requests/v1-gig-by-public-id-get-request';

function mapGigFeedItemToV1(item: GigFeedItem): V1GetGigsResponseBodyGig {
  const mapped: V1GetGigsResponseBodyGig = {
    id: item.id,
    title: item.title,
    date: item.date.toString(),
    city: item.city,
    country: item.country,
    venue: item.venue,
    ticketsUrl: item.ticketsUrl,
    calendarUrl: item.calendarUrl,
  };
  if (item.endDate !== undefined) {
    mapped.endDate = item.endDate.toString();
  }
  if (item.posterUrl !== undefined) {
    mapped.posterUrl = item.posterUrl;
  }
  if (item.postUrl !== undefined) {
    mapped.postUrl = item.postUrl;
  }
  return mapped;
}

export function mapV1GigGetQuery(
  query: V1GigGetRequestQuery,
): GetVisibleGigsParams {
  const params: GetVisibleGigsParams = {
    from: query.from,
    city: query.city,
    country: query.country,
  };
  if (query.direction !== undefined) {
    params.direction = query.direction;
  }
  if (query.cursor !== undefined) {
    params.cursor = query.cursor;
  }
  if (query.limit !== undefined) {
    params.limit = query.limit;
  }
  if (query.to !== undefined) {
    params.to = query.to;
  }
  return params;
}

export function mapVisibleGigsResultToV1(
  result: GetVisibleGigsResult,
): V1GetGigsResponseBody {
  const response: V1GetGigsResponseBody = {
    gigs: result.gigs.map(mapGigFeedItemToV1),
  };
  if (result.prevCursor !== undefined) {
    response.prevCursor = result.prevCursor;
  }
  if (result.nextCursor !== undefined) {
    response.nextCursor = result.nextCursor;
  }
  return response;
}

export function mapV1GigAroundQuery(
  query: V1GigAroundGetRequestQuery,
): GetVisibleGigsAroundParams {
  const params: GetVisibleGigsAroundParams = {
    anchor: query.anchor,
    city: query.city,
    country: query.country,
  };
  if (query.beforeLimit !== undefined) {
    params.beforeLimit = query.beforeLimit;
  }
  if (query.afterLimit !== undefined) {
    params.afterLimit = query.afterLimit;
  }
  return params;
}

export function mapVisibleGigsAroundResultToV1(
  result: GetVisibleGigsAroundResult,
): V1GigAroundGetResponseBody {
  const response: V1GigAroundGetResponseBody = {
    before: result.before.map(mapGigFeedItemToV1),
    after: result.after.map(mapGigFeedItemToV1),
  };
  if (result.prevCursor !== undefined) {
    response.prevCursor = result.prevCursor;
  }
  if (result.nextCursor !== undefined) {
    response.nextCursor = result.nextCursor;
  }
  return response;
}

export function mapV1GigDatesQuery(
  query: V1GigDatesGetRequestQuery,
): GetVisibleGigDatesParams {
  const params: GetVisibleGigDatesParams = {
    from: query.from,
    city: query.city,
    country: query.country,
  };
  if (query.to !== undefined) {
    params.to = query.to;
  }
  return params;
}

export function mapVisibleGigDatesResultToV1(
  result: GetVisibleGigDatesResult,
): V1GigDatesGetResponseBody {
  return { dates: result.dates.map(String) };
}

export function mapVisibleGigDateByPublicIdResultToV1(
  result: GetVisibleGigDateByPublicIdResult,
): V1GigByPublicIdGetResponseBody {
  return { date: result.date.toString() };
}
