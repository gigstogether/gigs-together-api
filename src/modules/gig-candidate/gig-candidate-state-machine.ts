import { GigCandidateStatus } from './types/gig-candidate-status.enum';

export enum GigCandidateCommand {
  SendToModeration = 'sendGigCandidateToModeration',
  Reject = 'rejectGigCandidate',
  UpdateDraft = 'updateGigCandidateDraft',
  Approve = 'approveGigCandidate',
}

export type GigCandidateConflictReason =
  'illegalTransition' | 'versionConflict' | 'concurrentModification';

export interface GigCandidateTransitionPolicy {
  toStatus: GigCandidateStatus;
  isIdempotent: boolean;
  isExecutable: boolean;
}

export interface GigCandidateConflictErrorParams {
  gigCandidateId: string;
  command: GigCandidateCommand;
  reason: GigCandidateConflictReason;
  message: string;
}

export class GigCandidateConflictError extends Error {
  gigCandidateId: string;
  command: GigCandidateCommand;
  reason: GigCandidateConflictReason;

  constructor(params: GigCandidateConflictErrorParams) {
    super(params.message);
    this.name = GigCandidateConflictError.name;
    this.gigCandidateId = params.gigCandidateId;
    this.command = params.command;
    this.reason = params.reason;
  }
}

export interface GetGigCandidateTransitionPolicyParams {
  gigCandidateId: string;
  status: GigCandidateStatus;
  command: GigCandidateCommand;
}

export function getGigCandidateTransitionPolicy(
  params: GetGigCandidateTransitionPolicyParams,
): GigCandidateTransitionPolicy {
  const { gigCandidateId, status, command } = params;

  switch (command) {
    case GigCandidateCommand.SendToModeration:
      if (status === GigCandidateStatus.New) {
        return {
          toStatus: GigCandidateStatus.Reviewing,
          isIdempotent: false,
          isExecutable: true,
        };
      }
      if (status === GigCandidateStatus.Reviewing) {
        return {
          toStatus: GigCandidateStatus.Reviewing,
          isIdempotent: true,
          isExecutable: true,
        };
      }
      break;
    case GigCandidateCommand.Reject:
      if (
        status === GigCandidateStatus.New ||
        status === GigCandidateStatus.Reviewing
      ) {
        return {
          toStatus: GigCandidateStatus.Rejected,
          isIdempotent: false,
          isExecutable: true,
        };
      }
      break;
    case GigCandidateCommand.UpdateDraft:
      if (status === GigCandidateStatus.Reviewing) {
        return {
          toStatus: GigCandidateStatus.Reviewing,
          isIdempotent: false,
          isExecutable: true,
        };
      }
      break;
    case GigCandidateCommand.Approve:
      if (status === GigCandidateStatus.Reviewing) {
        return {
          toStatus: GigCandidateStatus.Approved,
          isIdempotent: false,
          isExecutable: true,
        };
      }
      if (status === GigCandidateStatus.Approved) {
        return {
          toStatus: GigCandidateStatus.Approved,
          isIdempotent: true,
          isExecutable: true,
        };
      }
      break;
  }

  throw new GigCandidateConflictError({
    gigCandidateId,
    command,
    reason: 'illegalTransition',
    message: `Cannot execute ${command} for GigCandidate ${gigCandidateId} in ${status} status.`,
  });
}
