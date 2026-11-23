export interface V1AdminGigCandidateGigDraftRequestBody {
  communityIds: string[];
  venueIds?: string[];
  title?: string;
  date?: string;
  endDate?: string;
  ticketsUrl?: string;
  posterUrl?: string;
}

export interface V1AdminCreateGigCandidateRequestBody {
  localityId?: string;
  gigDraft: V1AdminGigCandidateGigDraftRequestBody;
}

export interface V1AdminUpdateGigCandidateDraftRequestBody {
  expectedVersion: number;
  localityId?: string;
  gigDraft: V1AdminGigCandidateGigDraftRequestBody;
}

export interface V1AdminRejectGigCandidateRequestBody {
  expectedVersion: number;
}

export interface V1AdminApproveGigCandidateRequestBody {
  expectedVersion: number;
}

export interface V1AdminSendGigCandidateToModerationRequestBody {
  expectedVersion: number;
}

export interface V1AdminGigCandidateLookupRequestBody {
  title: string;
  location: string;
}

export interface V1AdminGigCandidateLookupGigDraftResponseBody {
  title: string;
  date: string;
  endDate?: string;
  ticketsUrl: string;
  posterUrl?: string;
}

export interface V1AdminGigCandidateLookupLocationHintResponseBody {
  locality: string;
  country: string;
  venue: string;
}

interface V1AdminGigCandidateLookupMatchResponseBody {
  gigDraft: V1AdminGigCandidateLookupGigDraftResponseBody;
  locationHint: V1AdminGigCandidateLookupLocationHintResponseBody;
}

interface V1AdminGigCandidateLookupNoMatchResponseBody {
  gigDraft: null;
}

export type V1AdminGigCandidateLookupResponseBody =
  | V1AdminGigCandidateLookupMatchResponseBody
  | V1AdminGigCandidateLookupNoMatchResponseBody;
