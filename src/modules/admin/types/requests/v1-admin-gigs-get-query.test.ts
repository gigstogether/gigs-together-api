import { describe, expect, it } from 'vitest';

import { Status } from '../../../gig/types/status.enum';
import { mapAdminGigListStatusQueryToGigStatuses } from './v1-admin-gigs-get-query';

describe('mapAdminGigListStatusQueryToGigStatuses', () => {
  it('should map approved to approved and published gig statuses', () => {
    expect(mapAdminGigListStatusQueryToGigStatuses('approved')).toEqual([
      Status.Approved,
      Status.Published,
    ]);
  });

  it('should map pending to pending and new gig statuses', () => {
    expect(mapAdminGigListStatusQueryToGigStatuses('pending')).toEqual([
      Status.Pending,
      Status.New,
    ]);
  });

  it('should map rejected to rejected gig status', () => {
    expect(mapAdminGigListStatusQueryToGigStatuses('rejected')).toEqual([
      Status.Rejected,
    ]);
  });
});
