import type { ArgumentsHost } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { GigCandidateCommand } from '@modules/gig-candidate/gig-candidate-state-machine';
import { GigCandidateConflictError } from '@modules/gig-candidate/gig-candidate-state-machine';
import {
  GIG_CANDIDATE_CONFLICT_CODE,
  AdminGigCandidateConflictFilter,
} from './admin-gig-candidate-conflict.filter';

describe('AdminGigCandidateConflictFilter', () => {
  it('should map domain conflict to HTTP 409 response', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
    const filter = new AdminGigCandidateConflictFilter();
    const e = new GigCandidateConflictError({
      gigCandidateId: '507f1f77bcf86cd799439099',
      command: GigCandidateCommand.UpdateDraft,
      reason: 'versionConflict',
      message: 'GigCandidate version conflict',
    });

    filter.catch(e, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.CONFLICT,
      code: GIG_CANDIDATE_CONFLICT_CODE,
      reason: 'versionConflict',
      message: 'GigCandidate version conflict',
    });
  });
});
