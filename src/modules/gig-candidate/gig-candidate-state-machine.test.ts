import {
  GigCandidateCommand,
  GigCandidateConflictError,
  getGigCandidateTransitionPolicy,
} from './gig-candidate-state-machine';
import { GigCandidateStatus } from './types/gig-candidate-status.enum';

interface AllowedTransitionCase {
  status: GigCandidateStatus;
  command: GigCandidateCommand;
  toStatus: GigCandidateStatus;
  isIdempotent: boolean;
  isExecutable: boolean;
}

const GIG_CANDIDATE_ID = '507f1f77bcf86cd799439099';

const allowedTransitions: AllowedTransitionCase[] = [
  {
    status: GigCandidateStatus.New,
    command: GigCandidateCommand.SendToModeration,
    toStatus: GigCandidateStatus.Reviewing,
    isIdempotent: false,
    isExecutable: true,
  },
  {
    status: GigCandidateStatus.Reviewing,
    command: GigCandidateCommand.SendToModeration,
    toStatus: GigCandidateStatus.Reviewing,
    isIdempotent: true,
    isExecutable: true,
  },
  {
    status: GigCandidateStatus.New,
    command: GigCandidateCommand.Reject,
    toStatus: GigCandidateStatus.Rejected,
    isIdempotent: false,
    isExecutable: true,
  },
  {
    status: GigCandidateStatus.Reviewing,
    command: GigCandidateCommand.Reject,
    toStatus: GigCandidateStatus.Rejected,
    isIdempotent: false,
    isExecutable: true,
  },
  {
    status: GigCandidateStatus.Reviewing,
    command: GigCandidateCommand.UpdateDraft,
    toStatus: GigCandidateStatus.Reviewing,
    isIdempotent: false,
    isExecutable: true,
  },
  {
    status: GigCandidateStatus.Reviewing,
    command: GigCandidateCommand.Approve,
    toStatus: GigCandidateStatus.Approved,
    isIdempotent: false,
    isExecutable: false,
  },
];

const allStatuses = Object.values(GigCandidateStatus);
const allCommands = Object.values(GigCandidateCommand);
const illegalTransitions = allStatuses.flatMap((status) =>
  allCommands
    .filter(
      (command) =>
        !allowedTransitions.some(
          (transition) =>
            transition.status === status && transition.command === command,
        ),
    )
    .map((command) => ({ status, command })),
);

describe('getGigCandidateTransitionPolicy', () => {
  it.each(allowedTransitions)(
    'should return $toStatus policy for $status and $command',
    ({ status, command, toStatus, isIdempotent, isExecutable }) => {
      expect(
        getGigCandidateTransitionPolicy({
          gigCandidateId: GIG_CANDIDATE_ID,
          status,
          command,
        }),
      ).toEqual({ toStatus, isIdempotent, isExecutable });
    },
  );

  it.each(illegalTransitions)(
    'should throw conflict for $status and $command',
    ({ status, command }) => {
      expect(() =>
        getGigCandidateTransitionPolicy({
          gigCandidateId: GIG_CANDIDATE_ID,
          status,
          command,
        }),
      ).toThrowError(
        expect.objectContaining({
          name: GigCandidateConflictError.name,
          reason: 'illegalTransition',
          command,
        }),
      );
    },
  );
});
