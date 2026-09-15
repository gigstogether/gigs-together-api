import { GigCandidateStatus } from '../../../gig-candidate/types/gig-candidate-status.enum';
import { mapAdminGigCandidateStatusQuery } from './v1-admin-gig-candidates-get-query';

describe('mapAdminGigCandidateStatusQuery', () => {
  it.each([
    ['new', GigCandidateStatus.New],
    ['reviewing', GigCandidateStatus.Reviewing],
    ['approved', GigCandidateStatus.Approved],
    ['rejected', GigCandidateStatus.Rejected],
  ] as const)('should map %s status to the domain enum', (status, expected) => {
    expect(mapAdminGigCandidateStatusQuery(status)).toBe(expected);
  });
});
