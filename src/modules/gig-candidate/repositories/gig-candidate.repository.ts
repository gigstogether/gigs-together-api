import type {
  GigCandidate,
  GigCandidatePost,
  GigCandidateSource,
} from '../types/gig-candidate.types';
import type {
  GigCandidateGigDraft,
  GigData,
} from '@modules/gig/types/gig.types';
import type { GigCandidateStatus } from '../types/gig-candidate-status.enum';
import type {
  AdminGigCandidateListSortBy,
  AdminGigCandidateListSortOrder,
} from '../gig-candidate-list-sort';

export const GIG_CANDIDATE_REPOSITORY = Symbol('GIG_CANDIDATE_REPOSITORY');

export interface CreateGigCandidateParams {
  gigCandidateId: string;
  status: GigCandidateStatus.New | GigCandidateStatus.Reviewing;
  source: GigCandidateSource;
  localityId?: string;
  gigDraft: GigCandidateGigDraft;
}

export interface UpdateGigCandidateGigDraftParams {
  gigCandidateId: string;
  expectedVersion: number;
  localityId?: string;
  gigDraft: GigCandidateGigDraft;
}

export interface SendGigCandidateToModerationRecordParams {
  gigCandidateId: string;
  expectedVersion: number;
  poster?: NonNullable<GigData['poster']>;
}

export interface RejectGigCandidateRecordParams {
  gigCandidateId: string;
  expectedVersion: number;
  rejectedByUserId: string;
  rejectedAt: Date;
}

export interface AppendGigCandidatePostIfAbsentParams {
  gigCandidateId: string;
  expectedVersion: number;
  post: GigCandidatePost;
}

export interface UpdateGigCandidateModerationPostFileIdParams {
  gigCandidateId: string;
  expectedVersion: number;
  messageId: number;
  chatId: number;
  fileId: string;
}

export interface FindGigCandidatesParams {
  status: GigCandidateStatus;
  limit: number;
  sortBy?: AdminGigCandidateListSortBy;
  sortOrder?: AdminGigCandidateListSortOrder;
}

export interface GigCandidateRepository {
  createId(): string;

  createGigCandidate(params: CreateGigCandidateParams): Promise<GigCandidate>;

  updateGigCandidateGigDraft(
    params: UpdateGigCandidateGigDraftParams,
  ): Promise<GigCandidate | null>;

  sendGigCandidateToModeration(
    params: SendGigCandidateToModerationRecordParams,
  ): Promise<GigCandidate | null>;

  rejectGigCandidate(
    params: RejectGigCandidateRecordParams,
  ): Promise<GigCandidate | null>;

  findById(gigCandidateId: string): Promise<GigCandidate | null>;

  findMany(params: FindGigCandidatesParams): Promise<GigCandidate[]>;

  appendGigCandidatePostIfAbsent(
    params: AppendGigCandidatePostIfAbsentParams,
  ): Promise<GigCandidate | null>;

  updateGigCandidateModerationPostFileId(
    params: UpdateGigCandidateModerationPostFileIdParams,
  ): Promise<GigCandidate | null>;
}
