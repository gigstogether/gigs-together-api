import { BadRequestException } from '@nestjs/common';

import { msToYmd } from '../../shared/utils/date-formatter';
import { ADMIN_GIG_CANDIDATE_LIST_DEFAULT_LIMIT } from '../gig-candidate/gig-candidate-list-sort';
import type {
  CreateAdminGigCandidateParams,
  GigCandidateDraftLookupResult,
  UpdateAdminGigCandidateDraftParams,
} from '../gig-candidate/types/gig-candidate.types';
import type { GigPosterFile } from '../gig/types/gig-poster.types';
import type {
  AdminGigCandidateDetails,
  GetAdminGigCandidatesParams,
} from './admin-gig-candidate.types';
import type { V1AdminGigCandidatesGetQueryDto } from './types/requests/v1-admin-gig-candidates-get-query';
import { mapAdminGigCandidateStatusQuery } from './types/requests/v1-admin-gig-candidates-get-query';
import type {
  V1AdminCreateGigCandidateRequestBody,
  V1AdminGigCandidateGigDraftRequestBody,
  V1AdminGigCandidateLookupResponseBody,
  V1AdminUpdateGigCandidateDraftRequestBody,
} from './types/requests/v1-admin-gig-candidate-requests';
import type {
  V1AdminGigCandidateResponseBody,
  V1AdminGigCandidatesListResponseBody,
  V1AdminGigCandidateSourceResponseBody,
} from './types/requests/v1-admin-gig-candidates-response';

interface MapV1AdminCreateGigCandidateRequestParams {
  body: V1AdminCreateGigCandidateRequestBody;
  userId: string;
  posterFile?: Express.Multer.File;
}

interface MapV1AdminUpdateGigCandidateDraftRequestParams {
  body: V1AdminUpdateGigCandidateDraftRequestBody;
  gigCandidateId: string;
  posterFile?: Express.Multer.File;
}

interface MappedV1AdminGigCandidateGigDraftRequest {
  gigDraft: AdminGigCandidateDetails['gigDraft'];
  posterUrl?: string;
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
    source: mapV1AdminGigCandidateSourceResponse(gigCandidate.source),
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
    intakePostUrl: gigCandidate.intakePostUrl,
    intakePostDate: gigCandidate.intakePostDate,
    moderationPostUrl: gigCandidate.moderationPostUrl,
    moderationPostDate: gigCandidate.moderationPostDate,
    linkedGigPublicId: gigCandidate.linkedGigPublicId,
    approvedAt: gigCandidate.approvedAt?.toISOString(),
    approvedByUserId: gigCandidate.approvedByUserId,
    rejectedAt: gigCandidate.rejectedAt?.toISOString(),
    rejectedByUserId: gigCandidate.rejectedByUserId,
    createdAt: gigCandidate.createdAt.toISOString(),
    updatedAt: gigCandidate.updatedAt.toISOString(),
  };
}

export function mapV1AdminCreateGigCandidateRequest(
  params: MapV1AdminCreateGigCandidateRequestParams,
): CreateAdminGigCandidateParams {
  const mapped = mapV1AdminGigCandidateGigDraftRequest(params.body.gigDraft);
  return {
    userId: params.userId,
    gigDraft: mapped.gigDraft,
    posterUrl: mapped.posterUrl,
    posterFile: mapV1AdminGigCandidatePosterFile(params.posterFile),
  };
}

export function mapV1AdminUpdateGigCandidateDraftRequest(
  params: MapV1AdminUpdateGigCandidateDraftRequestParams,
): UpdateAdminGigCandidateDraftParams {
  const mapped = mapV1AdminGigCandidateGigDraftRequest(params.body.gigDraft);
  return {
    gigCandidateId: params.gigCandidateId,
    expectedVersion: params.body.expectedVersion,
    gigDraft: mapped.gigDraft,
    posterUrl: mapped.posterUrl,
    posterFile: mapV1AdminGigCandidatePosterFile(params.posterFile),
  };
}

export function mapV1AdminGigCandidateLookupResponse(
  gigDraft: GigCandidateDraftLookupResult | null,
): V1AdminGigCandidateLookupResponseBody {
  return { gigDraft };
}

export function mapV1AdminGigCandidatesListResponse(
  gigCandidates: AdminGigCandidateDetails[],
): V1AdminGigCandidatesListResponseBody {
  return {
    gigCandidates: gigCandidates.map(mapV1AdminGigCandidateResponse),
  };
}

function mapV1AdminGigCandidateGigDraftRequest(
  input: V1AdminGigCandidateGigDraftRequestBody,
): MappedV1AdminGigCandidateGigDraftRequest {
  const title = optionalTrimmedString(input.title);
  const date = optionalYmdToMs(input.date, 'date');
  const endDate = optionalYmdToMs(input.endDate, 'endDate');
  if (date !== undefined && endDate !== undefined && endDate < date) {
    throw new BadRequestException('endDate must be on or after date');
  }
  const city = optionalTrimmedString(input.city);
  const country = optionalTrimmedString(input.country)?.toUpperCase();
  if (country !== undefined && !/^[A-Z]{2}$/.test(country)) {
    throw new BadRequestException('country must be an ISO 3166-1 alpha-2 code');
  }
  const venue = optionalTrimmedString(input.venue);
  const ticketsUrl = optionalUrl(input.ticketsUrl, 'ticketsUrl');
  const posterUrl = optionalUrl(input.posterUrl, 'posterUrl');

  return {
    gigDraft: {
      ...(title !== undefined ? { title } : {}),
      ...(date !== undefined ? { date } : {}),
      ...(endDate !== undefined ? { endDate } : {}),
      ...(city !== undefined ? { city } : {}),
      ...(country !== undefined ? { country } : {}),
      ...(venue !== undefined ? { venue } : {}),
      ...(ticketsUrl !== undefined ? { ticketsUrl } : {}),
    },
    ...(posterUrl !== undefined ? { posterUrl } : {}),
  };
}

function mapV1AdminGigCandidateSourceResponse(
  source: AdminGigCandidateDetails['source'],
): V1AdminGigCandidateSourceResponseBody {
  if (source.type === 'user') {
    return {
      type: 'user',
      userId: source.userId,
      origin: { ...source.origin },
      ...(source.originalText !== undefined
        ? { originalText: source.originalText }
        : {}),
      ...(source.attachments !== undefined
        ? {
            attachments: source.attachments.map((attachment) => ({
              ...attachment,
            })),
          }
        : {}),
    };
  }

  return {
    type: 'provider',
    provider: {
      name: source.provider.name,
      externalEventId: source.provider.externalEventId,
      sourceUrl: source.provider.sourceUrl,
      fetchedAt: source.provider.fetchedAt.toISOString(),
      ...(source.provider.externalVersionId !== undefined
        ? { externalVersionId: source.provider.externalVersionId }
        : {}),
      ...(source.provider.providerUpdatedAt !== undefined
        ? { providerUpdatedAt: source.provider.providerUpdatedAt.toISOString() }
        : {}),
    },
  };
}

function mapV1AdminGigCandidatePosterFile(
  posterFile: Express.Multer.File | undefined,
): GigPosterFile | undefined {
  if (!posterFile) {
    return undefined;
  }
  return { buffer: posterFile.buffer, mimetype: posterFile.mimetype };
}

function optionalTrimmedString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function optionalUrl(
  value: string | undefined,
  field: string,
): string | undefined {
  const trimmed = optionalTrimmedString(value);
  if (trimmed === undefined) {
    return undefined;
  }
  try {
    new URL(trimmed);
  } catch {
    throw new BadRequestException(`${field} must be a valid URL`);
  }
  return trimmed;
}

function optionalYmdToMs(
  value: string | undefined,
  field: string,
): number | undefined {
  const trimmed = optionalTrimmedString(value);
  if (trimmed === undefined) {
    return undefined;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new BadRequestException(`${field} must be in YYYY-MM-DD format`);
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== trimmed
  ) {
    throw new BadRequestException(`${field} must be a valid date`);
  }
  return parsed.getTime();
}
