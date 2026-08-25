import type {
  AppendGigCandidatePostParams,
  CreateGigCandidateParams,
  GigCandidate,
  FindGigCandidatesParams,
  RejectGigCandidateRecordParams,
  SendGigCandidateToModerationParams,
  UpdateGigCandidateDraftParams,
} from '../types/gig-candidate.types';

export const GIG_CANDIDATE_REPOSITORY = Symbol('GIG_CANDIDATE_REPOSITORY');

export interface GigCandidateRepository {
  createId(): string;

  createGigCandidate(params: CreateGigCandidateParams): Promise<GigCandidate>;

  updateGigCandidateDraft(
    params: UpdateGigCandidateDraftParams,
  ): Promise<GigCandidate | null>;

  sendGigCandidateToModeration(
    params: SendGigCandidateToModerationParams,
  ): Promise<GigCandidate | null>;

  rejectGigCandidate(
    params: RejectGigCandidateRecordParams,
  ): Promise<GigCandidate | null>;

  findById(gigCandidateId: string): Promise<GigCandidate | null>;

  findMany(params: FindGigCandidatesParams): Promise<GigCandidate[]>;

  appendGigCandidatePost(
    params: AppendGigCandidatePostParams,
  ): Promise<GigCandidate | null>;
}
