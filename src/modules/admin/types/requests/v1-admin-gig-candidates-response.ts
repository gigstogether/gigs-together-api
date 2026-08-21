import type { GigSuggestedBy } from '../../../gig/types/gig.types';
import type { GigCandidateSource } from '../../../gig-candidate/types/gig-candidate-source.enum';
import type { GigCandidateStatus } from '../../../gig-candidate/types/gig-candidate-status.enum';

export interface V1AdminGigCandidateResponseBody {
  id: string;
  source: GigCandidateSource;
  title: string;
  date: string;
  endDate?: string;
  city: string;
  country: string;
  venue?: string;
  ticketsUrl?: string;
  posterUrl?: string;
  status: GigCandidateStatus;
  suggestedBy: GigSuggestedBy;
  postUrl?: string;
  postDate?: number;
  linkedGigPublicId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface V1AdminGigCandidatesListResponseBody {
  gigCandidates: V1AdminGigCandidateResponseBody[];
}
