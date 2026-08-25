export interface V1AdminGigCandidateGigDraftRequestBody {
  title?: string;
  date?: string;
  endDate?: string;
  city?: string;
  country?: string;
  venue?: string;
  ticketsUrl?: string;
  posterUrl?: string;
}

export interface V1AdminCreateGigCandidateRequestBody {
  gigDraft: V1AdminGigCandidateGigDraftRequestBody;
}

export interface V1AdminUpdateGigCandidateDraftRequestBody {
  expectedVersion: number;
  gigDraft: V1AdminGigCandidateGigDraftRequestBody;
}

export interface V1AdminRejectGigCandidateRequestBody {
  expectedVersion: number;
}

export interface V1AdminSendGigCandidateToModerationRequestBody {
  expectedVersion: number;
}

export interface V1AdminGigCandidateLookupRequestBody {
  title: string;
  location: string;
}

export interface V1AdminGigCandidateLookupResponseBody {
  gigDraft: V1AdminGigCandidateGigDraftRequestBody | null;
}
