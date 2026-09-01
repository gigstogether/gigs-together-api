import type {
  ApproveGigCandidateRecordParams,
  GigCandidate,
} from '../types/gig-candidate.types';
import type { GigData, GigSource } from '../../gig/types/gig.types';

export const GIG_CANDIDATE_APPROVAL_REPOSITORY = Symbol(
  'GIG_CANDIDATE_APPROVAL_REPOSITORY',
);

export interface GigApprovalResult extends GigData {
  id: string;
  publicId: string;
  source: GigSource;
  version: number;
  isVisible: boolean;
}

export interface CreateGigAfterApprovalParams extends GigData {
  gigId: string;
  publicId: string;
  source: GigSource;
}

export interface GigCandidateApprovalTransaction {
  createGigId(): string;
  findGigCandidateById(gigCandidateId: string): Promise<GigCandidate | null>;
  findGigById(gigId: string): Promise<GigApprovalResult | null>;
  isGigPublicIdTaken(publicId: string): Promise<boolean>;
  approveGigCandidate(
    params: ApproveGigCandidateRecordParams,
  ): Promise<GigCandidate | null>;
  createGig(params: CreateGigAfterApprovalParams): Promise<GigApprovalResult>;
}

export interface GigCandidateApprovalRepository {
  withTransaction<TResult>(
    work: (transaction: GigCandidateApprovalTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}
