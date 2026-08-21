import { msToYmd } from '../../shared/utils/date-formatter';
import { ADMIN_GIG_CANDIDATE_LIST_DEFAULT_LIMIT } from '../gig-candidate/gig-candidate-list-sort';
import type { PlainGig, GigFormData } from '../gig/types/gig.types';
import type {
  AdminGigCandidateDetails,
  GetAdminGigCandidatesParams,
} from './admin-gig-candidate.types';
import type { V1AdminGigCandidatesGetQueryDto } from './types/requests/v1-admin-gig-candidates-get-query';
import { mapAdminGigCandidateStatusQuery } from './types/requests/v1-admin-gig-candidates-get-query';
import type {
  V1AdminGigCandidateResponseBody,
  V1AdminGigCandidatesListResponseBody,
} from './types/requests/v1-admin-gig-candidates-response';

export interface MapGigToFormData {
  readonly gig: PlainGig;
  readonly posterUrl?: string;
  readonly publishPostUrl?: string;
  readonly publishPostDate?: number;
  readonly moderationPostUrl?: string;
  readonly moderationPostDate?: number;
}

export function mapGigToFormData(params: MapGigToFormData): GigFormData {
  const {
    gig,
    posterUrl,
    publishPostUrl,
    publishPostDate,
    moderationPostUrl,
    moderationPostDate,
  } = params;

  const date = msToYmd(gig.date);
  if (!date) {
    throw new Error(`Gig ${String(gig._id)} is missing a valid event date`);
  }

  const ticketsUrl = (gig.ticketsUrl ?? '').trim();

  return {
    publicId: gig.publicId,
    title: gig.title,
    date,
    endDate: msToYmd(gig.endDate),
    city: gig.city,
    country: gig.country,
    venue: gig.venue,
    ticketsUrl,
    posterUrl,
    status: gig.status,
    suggestedBy: {
      userId: gig.suggestedBy.userId.toString(),
      username: gig.suggestedBy.username,
      name: gig.suggestedBy.name,
    },
    publishPostUrl,
    publishPostDate,
    moderationPostUrl,
    moderationPostDate,
  };
}

export function mapV1AdminGigCandidatesQuery(
  query: V1AdminGigCandidatesGetQueryDto,
): GetAdminGigCandidatesParams {
  return {
    status: mapAdminGigCandidateStatusQuery(query.status),
    limit: query.limit ?? ADMIN_GIG_CANDIDATE_LIST_DEFAULT_LIMIT,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  };
}

export function mapV1AdminGigCandidateResponse(
  candidate: AdminGigCandidateDetails,
): V1AdminGigCandidateResponseBody {
  const date = msToYmd(candidate.date);
  if (!date) {
    throw new Error(
      `GigCandidate ${candidate.id} is missing a valid event date`,
    );
  }

  return {
    id: candidate.id,
    source: candidate.source,
    title: candidate.title,
    date,
    endDate: msToYmd(candidate.endDate),
    city: candidate.city,
    country: candidate.country,
    venue: candidate.venue,
    ticketsUrl: candidate.ticketsUrl,
    posterUrl: candidate.posterUrl,
    status: candidate.status,
    suggestedBy: candidate.suggestedBy,
    postUrl: candidate.postUrl,
    postDate: candidate.postDate,
    linkedGigPublicId: candidate.linkedGigPublicId,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
  };
}

export function mapV1AdminGigCandidatesListResponse(
  candidates: AdminGigCandidateDetails[],
): V1AdminGigCandidatesListResponseBody {
  return {
    gigCandidates: candidates.map(mapV1AdminGigCandidateResponse),
  };
}
