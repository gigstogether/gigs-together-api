import type { GigCandidateSource } from '../../../gig-candidate/types/gig-candidate.types';
import type { GigCandidateStatus } from '../../../gig-candidate/types/gig-candidate-status.enum';

export interface V1AdminGigCandidateGigDraftResponseBody {
  title?: string;
  date?: string;
  endDate?: string;
  city?: string;
  country?: string;
  venue?: string;
  ticketsUrl?: string;
  posterUrl?: string;
}

export interface V1AdminGigCandidateResponseBody {
  id: string;
  source: GigCandidateSource;
  gigDraft: V1AdminGigCandidateGigDraftResponseBody;
  status: GigCandidateStatus;
  version: number;
  postUrl?: string;
  postDate?: number;
  linkedGigPublicId?: string;
  approvedAt?: string;
  approvedByUserId?: string;
  rejectedAt?: string;
  rejectedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface V1AdminGigCandidatesListResponseBody {
  gigCandidates: V1AdminGigCandidateResponseBody[];
}
