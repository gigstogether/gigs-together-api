import type {
  AdminGigCandidateListSortBy,
  AdminGigCandidateListSortOrder,
} from '../gig-candidate/gig-candidate-list-sort';
import type {
  GigCandidateSourceProvider,
  GigCandidateSourceUser,
} from '../gig-candidate/types/gig-candidate.types';
import type { GigData } from '../gig/types/gig.types';
import type { GigCandidateStatus } from '../gig-candidate/types/gig-candidate-status.enum';

export interface GetAdminGigCandidatesParams {
  status: GigCandidateStatus;
  limit: number;
  sortBy?: AdminGigCandidateListSortBy;
  sortOrder?: AdminGigCandidateListSortOrder;
}

export interface AdminGigCandidateUserSource extends GigCandidateSourceUser {
  displayName?: string;
  isCurrentlyAdmin: boolean;
  telegramUsername?: string;
}

export type AdminGigCandidateSource =
  AdminGigCandidateUserSource | GigCandidateSourceProvider;

export interface AdminGigCandidateDetails {
  id: string;
  source: AdminGigCandidateSource;
  gigDraft: Partial<GigData>;
  version: number;
  posterUrl?: string;
  status: GigCandidateStatus;
  intakePostUrl?: string;
  intakePostDate?: number;
  moderationPostUrl?: string;
  moderationPostDate?: number;
  linkedGigPublicId?: string;
  approvedAt?: Date;
  approvedByUserId?: string;
  rejectedAt?: Date;
  rejectedByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}
