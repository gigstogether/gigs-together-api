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
  gigCandidate: AdminGigCandidateDetails,
): V1AdminGigCandidateResponseBody {
  const { gigDraft } = gigCandidate;

  return {
    id: gigCandidate.id,
    source: gigCandidate.source,
    gigDraft: {
      title: gigDraft.title,
      date: msToYmd(gigDraft.date),
      endDate: msToYmd(gigDraft.endDate),
      city: gigDraft.city,
      country: gigDraft.country,
      venue: gigDraft.venue,
      ticketsUrl: gigDraft.ticketsUrl,
      posterUrl: gigCandidate.posterUrl,
    },
    status: gigCandidate.status,
    version: gigCandidate.version,
    postUrl: gigCandidate.postUrl,
    postDate: gigCandidate.postDate,
    linkedGigPublicId: gigCandidate.linkedGigPublicId,
    approvedAt: gigCandidate.approvedAt?.toISOString(),
    approvedByUserId: gigCandidate.approvedByUserId,
    rejectedAt: gigCandidate.rejectedAt?.toISOString(),
    rejectedByUserId: gigCandidate.rejectedByUserId,
    createdAt: gigCandidate.createdAt.toISOString(),
    updatedAt: gigCandidate.updatedAt.toISOString(),
  };
}

export function mapV1AdminGigCandidatesListResponse(
  gigCandidates: AdminGigCandidateDetails[],
): V1AdminGigCandidatesListResponseBody {
  return {
    gigCandidates: gigCandidates.map(mapV1AdminGigCandidateResponse),
  };
}
