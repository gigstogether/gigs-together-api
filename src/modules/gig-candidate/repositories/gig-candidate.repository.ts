import type {
  AppendGigCandidatePostParams,
  CreateGigCandidateRecordParams,
  MarkGigCandidateAcceptedParams,
  MarkGigCandidateRejectedParams,
  GigCandidateRecord,
  FindGigCandidatesParams,
} from '../types/gig-candidate.types';

export const GIG_CANDIDATE_REPOSITORY = Symbol('GIG_CANDIDATE_REPOSITORY');

export interface GigCandidateRepository {
  createId(): string;

  create(params: CreateGigCandidateRecordParams): Promise<GigCandidateRecord>;

  findById(id: string): Promise<GigCandidateRecord | null>;

  findMany(params: FindGigCandidatesParams): Promise<GigCandidateRecord[]>;

  appendSuggestionPost(
    params: AppendGigCandidatePostParams,
  ): Promise<GigCandidateRecord | null>;

  markAccepted(
    params: MarkGigCandidateAcceptedParams,
  ): Promise<GigCandidateRecord | null>;

  markRejected(
    params: MarkGigCandidateRejectedParams,
  ): Promise<GigCandidateRecord | null>;
}
