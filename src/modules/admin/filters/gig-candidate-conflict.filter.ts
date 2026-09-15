import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { GigCandidateConflictError } from '../../gig-candidate/gig-candidate-state-machine';

export const GIG_CANDIDATE_CONFLICT_CODE = 'GIG_CANDIDATE_CONFLICT' as const;

@Catch(GigCandidateConflictError)
export class GigCandidateConflictFilter implements ExceptionFilter {
  catch(e: GigCandidateConflictError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(HttpStatus.CONFLICT).json({
      statusCode: HttpStatus.CONFLICT,
      code: GIG_CANDIDATE_CONFLICT_CODE,
      reason: e.reason,
      message: e.message,
    });
  }
}
