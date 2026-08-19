import type {
  AdminGigCandidateListSortBy,
  AdminGigCandidateListSortOrder,
} from '../gig-candidate/gig-candidate-list-sort';
import type { GigCandidateRecord } from '../gig-candidate/types/gig-candidate.types';
import type { GigCandidateStatus } from '../gig-candidate/types/gig-candidate-status.enum';

export interface GetAdminGigCandidatesParams {
  status: GigCandidateStatus;
  limit: number;
  sortBy?: AdminGigCandidateListSortBy;
  sortOrder?: AdminGigCandidateListSortOrder;
}

export interface AdminGigCandidateDetails {
  id: string;
  source: GigCandidateRecord['source'];
  title: string;
  date: number;
  endDate?: number;
  city: string;
  country: string;
  venue?: string;
  ticketsUrl?: string;
  posterUrl?: string;
  status: GigCandidateRecord['status'];
  suggestedBy: GigCandidateRecord['suggestedBy'];
  suggestionPostUrl?: string;
  suggestionPostDate?: number;
  linkedGigPublicId?: string;
  createdAt: Date;
  updatedAt: Date;
}
