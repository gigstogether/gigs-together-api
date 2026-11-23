import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { GigCandidateApprovalValidationError } from '@modules/gig-candidate/gig-candidate-approval/gig-candidate-approval';

export const GIG_CANDIDATE_APPROVAL_VALIDATION_CODE =
  'GIG_CANDIDATE_APPROVAL_VALIDATION' as const;

@Catch(GigCandidateApprovalValidationError)
export class AdminGigCandidateApprovalValidationFilter implements ExceptionFilter {
  catch(e: GigCandidateApprovalValidationError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      code: GIG_CANDIDATE_APPROVAL_VALIDATION_CODE,
      message: e.message,
      issues: e.issues,
    });
  }
}
