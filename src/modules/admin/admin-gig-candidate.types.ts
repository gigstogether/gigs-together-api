import type {
  AdminGigCandidateListSortBy,
  AdminGigCandidateListSortOrder,
} from '../gig-candidate/gig-candidate-list-sort';
import type { GigCandidateSource } from '../gig-candidate/types/gig-candidate.types';
import type { GigData } from '../gig/types/gig.types';
import type { GigCandidateStatus } from '../gig-candidate/types/gig-candidate-status.enum';

export interface GetAdminGigCandidatesParams {
  status: GigCandidateStatus;
  limit: number;
  sortBy?: AdminGigCandidateListSortBy;
  sortOrder?: AdminGigCandidateListSortOrder;
}

export interface AdminGigCandidateDetails {
  id: string;
  source: GigCandidateSource;
  gigDraft: Partial<GigData>;
  version: number;
  posterUrl?: string;
  status: GigCandidateStatus;
  postUrl?: string;
  postDate?: number;
  linkedGigPublicId?: string;
  approvedAt?: Date;
  approvedByUserId?: string;
  rejectedAt?: Date;
  rejectedByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}
