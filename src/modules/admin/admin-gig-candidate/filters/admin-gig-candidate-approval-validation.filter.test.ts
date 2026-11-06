import type { ArgumentsHost } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { GigCandidateApprovalValidationError } from '@modules/gig-candidate/gig-candidate-approval/gig-candidate-approval';
import {
  GIG_CANDIDATE_APPROVAL_VALIDATION_CODE,
  AdminGigCandidateApprovalValidationFilter,
} from './admin-gig-candidate-approval-validation.filter';

describe('AdminGigCandidateApprovalValidationFilter', () => {
  it('should map structured validation issues to HTTP 400 response', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
    const filter = new AdminGigCandidateApprovalValidationFilter();
    const e = new GigCandidateApprovalValidationError([
      { field: 'title', code: 'required', message: 'title is required' },
    ]);

    filter.catch(e, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      code: GIG_CANDIDATE_APPROVAL_VALIDATION_CODE,
      message: e.message,
      issues: e.issues,
    });
  });
});
